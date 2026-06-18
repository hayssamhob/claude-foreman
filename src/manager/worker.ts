import type { Octokit } from "../octokit.js";
import { config } from "../config.js";
import { concludeCheck, postMessage, setStatusLabel, splitRepo } from "../github.js";
import { agentLabel, LABEL_TASK, statusLabel, taskBranch } from "../protocol/labels.js";
import { serializeMessage } from "../protocol/messages.js";
import { notify } from "../notify.js";
import { claudeAccountAgents, recordRateLimit, resetClock, checkCeilings } from "../agentlimits.js";
import { RateLimitedError } from "../ratelimit.js";
import type { JobRow, Store } from "../state/db.js";
import { decomposePrompt, reviewPrompt } from "./prompts.js";
import { ManagerUnavailableError, runManager } from "./runner.js";
import { routeOutcome } from "../referee/outcome.js";

const MAX_DIFF_CHARS = 60_000;

export type AuthFn = (installationId: number) => Promise<Octokit>;

interface DecomposeResult {
  tasks: { title: string; agent: string; spec: string; doneContract?: string[] }[];
}
export interface ReviewResult {
  verdict: "approve" | "request_changes";
  summary: string;
  plainSummary?: string;
  addressedPointNumbers?: number[];
  points: string[];
}

/** Drain the job queue. Called on an interval from index.ts; single-flight. */
export function startWorker(store: Store, auth: AuthFn, log: (msg: string) => void): () => Promise<void> {
  let running = false;
  return async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      // The manager is Claude; while it's rate-limited or halted, leave every job pending
      // and back off — retrying would only burn against the same limit.
      const s = store.agentStatus(config.managerName);
      if (s.state === "rate_limited" || s.state === "halted") {
        log(`manager ${s.state} (${s.reason}); holding jobs${s.reset_at ? ` until ${resetClock(s.reset_at)}` : " indefinitely"}`);
        return;
      }

      if (checkCeilings(store, log)) {
        return;
      }

      for (let job = store.nextJob(); job; job = store.nextJob()) {
        try {
          const octokit = await auth(job.installation_id);
          if (job.type === "decompose") await runDecompose(job, store, octokit);
          else await runReview(job, store, octokit);
          store.finishJob(job.id, "done");
        } catch (e) {
          if (e instanceof RateLimitedError) {
            // Not the job's fault: requeue it and stop draining until the limit clears.
            store.finishJob(job.id, "pending");
            recordRateLimit(store, claudeAccountAgents(), e.reason, e.resetAt, log);
            return;
          }
          if (e instanceof ManagerUnavailableError) {
            store.finishJob(job.id, "needs_human", e.message);
            log(`manager unavailable, job ${job.id} parked: ${e.message}`);
            await notify("Manager offline", `A ${job.type} request for ${job.repo}#${job.issue} is parked until the manager is back.`, {
              priority: "high",
              tags: ["warning"],
            });
          } else {
            store.finishJob(job.id, "failed", String(e));
            log(`job ${job.id} (${job.type} ${job.repo}#${job.issue}) failed: ${e}`);
            await notify("Manager job failed", `${job.type} on ${job.repo}#${job.issue}: ${String(e).slice(0, 180)}`, {
              priority: "high",
              tags: ["x"],
              click: `https://github.com/${job.repo}/issues/${job.issue}`,
            });
          }
        }
      }
    } finally {
      running = false;
    }
  };
}

async function runDecompose(job: JobRow, store: Store, octokit: Octokit): Promise<void> {
  const { owner, repo } = splitRepo(job.repo);
  const { data: epic } = await octokit.rest.issues.get({ owner, repo, issue_number: job.issue });

  const result = await runManager<DecomposeResult>(
    decomposePrompt({
      epicTitle: epic.title,
      epicBody: epic.body ?? "",
      agents: config.agents,
      repo: job.repo,
    }),
    (usd, inT, outT) => store.recordSpend(job.repo, job.issue, config.managerName, "decompose", usd, inT, outT)
  );
  if (!Array.isArray(result.tasks) || result.tasks.length === 0) {
    throw new Error("manager returned no tasks");
  }

  const created: string[] = [];
  for (const t of result.tasks) {
    const agent = config.agents.includes(t.agent?.toLowerCase()) ? t.agent.toLowerCase() : config.agents[0];
    const { data: issue } = await octokit.rest.issues.create({
      owner,
      repo,
      title: t.title,
      labels: [LABEL_TASK, agentLabel(agent), statusLabel("queued")],
      body: buildTaskBody(t.spec, agent, job.issue, job.repo, 0, t.doneContract ?? []),
    });
    // The assignment header needs the issue's own number, known only after creation
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: issue.number,
      body: buildTaskBody(t.spec, agent, job.issue, job.repo, issue.number, t.doneContract ?? []),
    });
    store.upsertTask({
      repo: job.repo,
      issue: issue.number,
      installation_id: job.installation_id,
      agent,
      status: "queued",
      title: t.title,
    });
    created.push(`- #${issue.number} → \`${agent}\`: ${t.title}`);
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: job.issue,
    body: `🤖 Decomposed into ${created.length} task(s):\n\n${created.join("\n")}`,
  });
}

export function buildTaskBody(spec: string, agent: string, epic: number, repo: string, taskIssue = 0, doneContract: string[] = []): string {
  let human = `> Parent epic: #${epic} · Assigned to: \`${agent}\` · Work on branch \`${taskBranch(agent, taskIssue || 0)}\` and open a PR containing \`Closes #${taskIssue || "<this issue>"}\`.\n\n${spec}`;
  
  if (Array.isArray(doneContract) && doneContract.length > 0) {
    const contractList = doneContract.map((c, i) => `${i + 1}. ${c}`).join("\n");
    human += `\n\n## Done-contract\n${contractList}`;
  }

  return serializeMessage(
    { v: 1, type: "assignment", from: config.managerName, to: agent, task: taskIssue },
    human
  );
}

async function runReview(job: JobRow, store: Store, octokit: Octokit): Promise<void> {
  const { owner, repo } = splitRepo(job.repo);
  const task = store.getTask(job.repo, job.issue);
  if (!task || !job.pr || !job.head_sha) throw new Error(`review job ${job.id} missing task/pr/sha`);

  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: job.pr });
  if (pr.head.sha !== job.head_sha) return; // superseded by a newer push; that push enqueued its own job

  const { data: taskIssue } = await octokit.rest.issues.get({ owner, repo, issue_number: job.issue });
  const diffResp = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: job.pr,
    mediaType: { format: "diff" },
  });
  let diff = diffResp.data as unknown as string;
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated for length — flag this in your review if it impairs judgement]";
  }

  const round = task.revision_round + 1;
  const openPoints = store.openRevisionPoints(job.repo, job.issue);
  const result = await runManager<ReviewResult>(
    reviewPrompt({
      repo: job.repo,
      taskIssue: job.issue,
      taskSpec: taskIssue.body ?? "",
      prTitle: pr.title,
      prBody: pr.body ?? "",
      diff,
      round,
      openPoints: openPoints.map((p) => p.text),
    }),
    (usd, inT, outT) => store.recordSpend(job.repo, job.issue, config.managerName, "review", usd, inT, outT)
  );

  // Update the per-point checklist the dashboard shows
  const outcome = routeOutcome(result);
  if (outcome.action === "fail") {
    throw new Error(`Review result invalid: ${outcome.reason}`);
  }
  if (outcome.action === "approve") {
    store.markPointsAddressed(openPoints.map((p) => p.id));
  } else {
    const addressedIds = (result.addressedPointNumbers ?? [])
      .map((n) => openPoints[n - 1]?.id)
      .filter((id): id is number => id !== undefined);
    store.markPointsAddressed(addressedIds);
    if (result.points?.length) store.addRevisionPoints(job.repo, job.issue, round, result.points);
  }

  if (outcome.action === "approve") {
    await concludeCheck(octokit, job.repo, job.head_sha, "success", "Approved by manager", result.summary);
    await postMessage(
      octokit,
      job.repo,
      job.pr,
      { v: 1, type: "approval", from: config.managerName, to: task.agent, task: job.issue, pr: job.pr },
      `✅ **Manager review: approved** (round ${round})\n\n${result.summary}\n\n${
        config.autoMerge
          ? `Will auto-merge once tests are green and all conversations are resolved (add the \`${config.holdLabel}\` label to the task issue to hold it for a manual merge).`
          : "Awaiting human merge."
      }`
    );
    store.updateTask(job.repo, job.issue, {
      status: "approved",
      revision_round: round,
      plain_summary: result.plainSummary ?? result.summary,
    });
    await setStatusLabel(octokit, job.repo, job.issue, "approved");
    if (!config.autoMerge) {
      await notify("Work ready for your merge ✅", result.plainSummary ?? result.summary, {
        tags: ["white_check_mark"],
        click: `https://github.com/${job.repo}/pull/${job.pr}`,
      });
    }
    return;
  }

  // request_changes
  const points = (result.points ?? []).map((p, i) => `${i + 1}. ${p}`).join("\n");
  await concludeCheck(octokit, job.repo, job.head_sha, "failure", "Changes requested by manager", result.summary);

  if (round > config.maxRevisionRounds) {
    await reassign(job, store, octokit, task.agent, result.summary);
    return;
  }

  await postMessage(
    octokit,
    job.repo,
    job.pr,
    { v: 1, type: "revision-request", from: config.managerName, to: task.agent, task: job.issue, pr: job.pr, round },
    `🔁 **Manager review: changes requested** (round ${round}/${config.maxRevisionRounds})\n\n${result.summary}\n\n${points}\n\n@${task.agent}: push fixes to the same branch; review re-runs automatically.`
  );
  store.updateTask(job.repo, job.issue, {
    status: "changes_requested",
    revision_round: round,
    lease_expires_at: Date.now() + config.leaseTtlMinutes * 60_000,
  });
  await setStatusLabel(octokit, job.repo, job.issue, "changes_requested");
}

async function reassign(
  job: JobRow,
  store: Store,
  octokit: Octokit,
  fromAgent: string,
  reason: string
): Promise<void> {
  const task = store.getTask(job.repo, job.issue)!;
  const others = config.agents.filter((a) => a !== fromAgent);
  const next = others[task.reassign_count % Math.max(others.length, 1)];

  if (!next || task.reassign_count + 1 >= config.agents.length) {
    store.updateTask(job.repo, job.issue, { status: "failed" });
    await setStatusLabel(octokit, job.repo, job.issue, "failed");
    await postMessage(
      octokit,
      job.repo,
      job.issue,
      { v: 1, type: "timeout", from: config.managerName, to: "human", task: job.issue },
      `🛑 Task failed review ${config.maxRevisionRounds}+ rounds and all agents have been tried. Human attention needed.\n\nLast assessment: ${reason}`
    );
    await notify("Task stuck — needs you 🛑", `"${task.title ?? `#${job.issue}`}" failed review with every agent. ${reason.slice(0, 160)}`, {
      priority: "urgent",
      tags: ["rotating_light"],
      click: `https://github.com/${job.repo}/issues/${job.issue}`,
    });
    return;
  }

  store.updateTask(job.repo, job.issue, {
    agent: next,
    status: "queued",
    pr: null,
    revision_round: 0,
    reassign_count: task.reassign_count + 1,
    lease_expires_at: null,
  });
  const { owner, repo } = splitRepo(job.repo);
  await octokit.rest.issues.removeLabel({ owner, repo, issue_number: job.issue, name: agentLabel(fromAgent) }).catch(() => {});
  await octokit.rest.issues.addLabels({ owner, repo, issue_number: job.issue, labels: [agentLabel(next)] });
  await setStatusLabel(octokit, job.repo, job.issue, "queued");
  await postMessage(
    octokit,
    job.repo,
    job.issue,
    { v: 1, type: "reassignment", from: config.managerName, to: next, task: job.issue },
    `🔄 Reassigned from \`${fromAgent}\` to \`${next}\` after ${config.maxRevisionRounds} failed revision rounds.\n\nManager's last assessment: ${reason}\n\n@${next}: claim this task and start fresh on branch \`${taskBranch(next, job.issue)}\`. Review the previous PR (#${job.pr}) for context on what NOT to repeat.`
  );
}
