/**
 * Devin Local adapter (M6-4b) — the self-referential wake-up.
 *
 * `agent:devin-local` on an issue -> fire `devin -p -- "<prompt>"` headlessly.
 * Devin is autonomous — it handles the repo, branch, edits, commit, push, and PR
 * itself (same behaviour as the Cloud adapter, different runtime). Runs on a
 * self-hosted runner with Devin Desktop installed (set `DISPATCH_RUNNER=self-hosted`).
 *
 * Dry-run when the `devin` binary is not in PATH — never throws on a missing CLI.
 */
import { execFileSync } from "node:child_process";
import type { FighterAdapter, WakeContext, WakeResult } from "./adapter.js";

/** Pure: assemble the lean Devin Local prompt. */
export function buildDevinLocalPrompt(ctx: WakeContext): string {
  return `Your task is Issue #${ctx.issueNumber} in ${ctx.repo}. Use the 'gh' CLI to read the issue body for the exact spec, work on a new branch '${ctx.branch}', open a PR with 'Closes #${ctx.issueNumber}', and comment '@hayssamhob ✅ #${ctx.issueNumber} done — <one sentence>' on the PR when finished. Stay strictly in scope (no auth, secrets, migrations, or spend limits).`;
}

export const devinLocalAdapter: FighterAdapter = {
  name: "devin-local",
  async wake(ctx: WakeContext): Promise<WakeResult> {
    // Step 1 — binary check (dry-run if `devin` not in PATH).
    let devinAvailable = true;
    try {
      execFileSync("devin", ["--version"], { stdio: "pipe" });
    } catch {
      devinAvailable = false;
    }
    if (!devinAvailable) {
      const prompt = buildDevinLocalPrompt(ctx);
      return {
        status: "dry-run",
        detail: `devin CLI not found in PATH — would run: devin -p -- "<prompt>" for #${ctx.issueNumber}. Prompt preview: ${prompt.slice(0, 200)}…`,
      };
    }

    // Step 2 — fire the CLI. Devin is autonomous; let errors propagate.
    const prompt = buildDevinLocalPrompt(ctx);
    execFileSync("devin", ["-p", "--", prompt], { stdio: "inherit" });

    // Step 3 — return.
    return {
      status: "woken",
      detail: `Devin Local session started for issue #${ctx.issueNumber} on branch ${ctx.branch}`,
    };
  },
};
