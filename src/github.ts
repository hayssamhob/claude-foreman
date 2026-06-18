import type { Octokit } from "./octokit.js";
import { config } from "./config.js";
import { ALL_STATUS, statusLabel, type TaskStatus } from "./protocol/labels.js";
import { serializeMessage, type AgentMessage } from "./protocol/messages.js";

export function splitRepo(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split("/");
  return { owner, repo: name };
}

/** Replace any status:* label on an issue with the one for `status`. */
export async function setStatusLabel(
  octokit: Octokit,
  repo: string,
  issue: number,
  status: TaskStatus
): Promise<void> {
  const { owner, repo: name } = splitRepo(repo);
  const { data: labels } = await octokit.rest.issues.listLabelsOnIssue({
    owner,
    repo: name,
    issue_number: issue,
    per_page: 100,
  });
  const stale = labels
    .map((l) => l.name)
    .filter((n) => ALL_STATUS.map(statusLabel).includes(n) && n !== statusLabel(status));
  for (const label of stale) {
    await octokit.rest.issues
      .removeLabel({ owner, repo: name, issue_number: issue, name: label })
      .catch(() => {});
  }
  try {
    await octokit.rest.issues.addLabels({
      owner,
      repo: name,
      issue_number: issue,
      labels: [statusLabel(status)],
    });
  } catch {
    // Label may not exist yet (e.g. added after setup-labels ran) — create and retry
    await octokit.rest.issues
      .createLabel({ owner, repo: name, name: statusLabel(status), color: "fbca04" })
      .catch(() => {});
    await octokit.rest.issues.addLabels({
      owner,
      repo: name,
      issue_number: issue,
      labels: [statusLabel(status)],
    });
  }
}

/** Post a mailbox comment (structured header + human-readable text). */
export async function postMessage(
  octokit: Octokit,
  repo: string,
  issueOrPr: number,
  msg: AgentMessage,
  humanText: string
): Promise<void> {
  const { owner, repo: name } = splitRepo(repo);
  await octokit.rest.issues.createComment({
    owner,
    repo: name,
    issue_number: issueOrPr,
    body: serializeMessage(msg, humanText),
  });
}

export async function createCheck(
  octokit: Octokit,
  repo: string,
  headSha: string,
  status: "queued" | "in_progress",
): Promise<number> {
  const { owner, repo: name } = splitRepo(repo);
  const { data } = await octokit.rest.checks.create({
    owner,
    repo: name,
    name: config.checkName,
    head_sha: headSha,
    status,
  });
  return data.id;
}

export async function concludeCheck(
  octokit: Octokit,
  repo: string,
  headSha: string,
  conclusion: "success" | "failure" | "action_required",
  title: string,
  summary: string
): Promise<void> {
  const { owner, repo: name } = splitRepo(repo);
  // Find the existing check run for this SHA (created when the PR was opened/updated)
  const { data } = await octokit.rest.checks.listForRef({
    owner,
    repo: name,
    ref: headSha,
    check_name: config.checkName,
    per_page: 10,
  });
  const existing = data.check_runs[0];
  if (existing) {
    await octokit.rest.checks.update({
      owner,
      repo: name,
      check_run_id: existing.id,
      status: "completed",
      conclusion,
      output: { title, summary },
    });
  } else {
    await octokit.rest.checks.create({
      owner,
      repo: name,
      name: config.checkName,
      head_sha: headSha,
      status: "completed",
      conclusion,
      output: { title, summary },
    });
  }
}
