import { config } from "./config.js";
import { postMessage, splitRepo } from "./github.js";
import type { AuthFn } from "./manager/worker.js";
import { notify } from "./notify.js";
import type { Store } from "./state/db.js";
import { ciStateFor, unresolvedThreads, type CiState } from "./threads.js";
import { isPreviewEnabled, previewGate } from "./referee/preview-mcp.js";

/**
 * Auto-merge: once the manager has approved a PR, it merges itself the moment
 * every remaining gate is green. The owner's escape hatch is the `hold` label
 * on the task issue — while present, the PR waits for a manual merge.
 */

export interface MergeGate {
  ok: boolean;
  reason: string; // human-readable; shown on the dashboard and in logs
}

export function mergeGate(args: {
  ci: CiState;
  openThreads: number;
  held: boolean;
  mergeable: boolean | null; // GitHub's PR mergeability; null = still computing
  previewOk?: boolean; // M4-2: preview MCP connector gate (undefined = disabled)
  previewReason?: string;
}): MergeGate {
  if (args.held) return { ok: false, reason: `the '${config.holdLabel}' label is on the task — waiting for you to merge manually` };
  if (args.ci.overall === "none") return { ok: false, reason: "no automated checks found — the done-contract requires a green CI run" };
  if (args.ci.overall === "red") return { ok: false, reason: `automated tests are failing (${args.ci.detail})` };
  if (args.ci.overall === "pending") return { ok: false, reason: `automated tests are still running (${args.ci.detail})` };
  if (args.openThreads > 0)
    return { ok: false, reason: `${args.openThreads} review conversation${args.openThreads > 1 ? "s are" : " is"} still unresolved` };
  if (args.mergeable === false) return { ok: false, reason: "the branch conflicts with the main line — needs a rebase" };
  if (args.mergeable === null) return { ok: false, reason: "GitHub is still computing mergeability — retrying shortly" };
  // M4-2: preview MCP connector gate
  if (args.previewOk === false) return { ok: false, reason: `preview gate failed: ${args.previewReason ?? "unknown"}` };
  return { ok: true, reason: "all gates green" };
}

/** Periodic sweep over approved tasks; merges those whose gates are all green. */
export async function sweepAutoMerge(store: Store, auth: AuthFn, log: (m: string) => void): Promise<void> {
  if (!config.autoMerge) return;
  const approved = store.listTasks().filter((t) => t.status === "approved" && t.pr);
  for (const t of approved) {
    try {
      const octokit = await auth(t.installation_id);
      const { owner, repo } = splitRepo(t.repo);
      const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: t.pr! });
      if (pr.merged || pr.state === "closed") continue; // webhook reconciles the task
      const [{ data: labels }, ci, threads] = await Promise.all([
        octokit.rest.issues.listLabelsOnIssue({ owner, repo, issue_number: t.issue, per_page: 100 }),
        ciStateFor(octokit, t.repo, t.pr!, config.checkName),
        unresolvedThreads(octokit, t.repo, t.pr!),
      ]);
      // M4-2: run the preview MCP connector gate if enabled
      let previewOk: boolean | undefined;
      let previewReason: string | undefined;
      if (isPreviewEnabled()) {
        const preview = await previewGate();
        previewOk = preview.ok;
        previewReason = preview.reason;
      }
      const gate = mergeGate({
        ci,
        openThreads: threads.open.length,
        held: labels.some((l) => l.name === config.holdLabel),
        mergeable: pr.mergeable,
        previewOk,
        previewReason,
      });
      if (!gate.ok) {
        log(`auto-merge waiting on ${t.repo}#${t.issue} (PR #${t.pr}): ${gate.reason}`);
        continue;
      }
      await octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: t.pr!,
        merge_method: "squash",
        commit_message: t.plain_summary ? `Behavior summary: ${t.plain_summary}` : undefined,
      });
      log(`auto-merged ${t.repo}#${t.issue} (PR #${t.pr})`);
      await postMessage(
        octokit,
        t.repo,
        t.pr!,
        { v: 1, type: "approval", from: config.managerName, to: t.agent, task: t.issue, pr: t.pr! },
        `🚀 **Auto-merged.** Manager review passed, tests green, all conversations resolved.`
      );
      await notify(
        "Work merged ✅",
        `“${t.title ?? `task #${t.issue}`}” by ${t.agent} is now part of ${t.repo.split("/")[1]}.`,
        { tags: ["rocket"], click: `https://github.com/${t.repo}/pull/${t.pr}` }
      );
      // pull_request.closed webhook flips the task to done
    } catch (e) {
      log(`auto-merge failed for ${t.repo}#${t.issue}: ${e}`);
    }
  }
}
