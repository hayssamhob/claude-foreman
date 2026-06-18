import type { Octokit } from "./octokit.js";
import { splitRepo } from "./github.js";
import { parseMessage } from "./protocol/messages.js";

/** Aggregated automated-check state for a PR's head commit. */
export interface CiState {
  overall: "green" | "red" | "pending" | "none";
  detail: string; // names of failing/pending checks, or pass count
}

export async function ciStateFor(
  octokit: Octokit,
  repoFull: string,
  pr: number,
  excludeCheck: string
): Promise<CiState> {
  const { owner, repo } = splitRepo(repoFull);
  const { data: prData } = await octokit.rest.pulls.get({ owner, repo, pull_number: pr });
  // Two CI reporting channels exist on GitHub: check runs (Actions and modern
  // apps) and commit statuses (legacy CI providers). Auto-merge must see both.
  const [{ data: checkData }, combined] = await Promise.all([
    octokit.rest.checks.listForRef({ owner, repo, ref: prData.head.sha, per_page: 50 }),
    octokit.rest.repos
      .getCombinedStatusForRef({ owner, repo, ref: prData.head.sha, per_page: 100 })
      .then((r) => r.data)
      .catch(() => null),
  ]);
  // The manager's own check is reported separately on the dashboard
  const runs = checkData.check_runs.filter((c) => c.name !== excludeCheck);
  const statuses = combined?.statuses ?? [];
  if (runs.length === 0 && statuses.length === 0) {
    return { overall: "none", detail: "no automated checks set up" };
  }
  const failing = [
    ...runs
      .filter((c) => c.conclusion && ["failure", "timed_out", "cancelled", "action_required"].includes(c.conclusion))
      .map((c) => c.name),
    ...statuses.filter((s) => s.state === "failure" || s.state === "error").map((s) => s.context),
  ];
  if (failing.length > 0) return { overall: "red", detail: failing.join(", ") };
  const pending = [
    ...runs.filter((c) => c.status !== "completed").map((c) => c.name),
    ...statuses.filter((s) => s.state === "pending").map((s) => s.context),
  ];
  if (pending.length > 0) return { overall: "pending", detail: pending.join(", ") };
  const total = runs.length + statuses.length;
  return { overall: "green", detail: `${total} check${total > 1 ? "s" : ""} passed` };
}

/** One unresolved PR review conversation, summarized for the dashboard. */
export interface ThreadSummary {
  id: string; // GraphQL node id — needed to reply to / resolve the thread
  path: string | null; // file the conversation is attached to, if any
  firstAuthor: string;
  firstSnippet: string;
  lastAuthor: string;
  lastAt: number; // epoch ms
  replies: number; // comments after the first
  /** "agent" when the manager/reviewer spoke last (junior owes a reply), "reviewer" otherwise. */
  waitingOn: "agent" | "reviewer";
  /** Commit SHA cited in the last reply ("Fixed in abc1234"), if any. */
  fixCommit: string | null;
}

/** Thread overview for a PR: open threads plus how many were properly resolved. */
export interface ThreadOverview {
  open: ThreadSummary[];
  resolvedCount: number;
  total: number;
}

const FIX_COMMIT_RE = /\b(?:fixed|addressed|corrected|done|résolu|corrigé)\b[^.\n]{0,30}?\b([0-9a-f]{7,40})\b|commit\s+([0-9a-f]{7,40})\b/i;

export function extractFixCommit(body: string): string | null {
  const m = body.match(FIX_COMMIT_RE);
  return m ? (m[1] ?? m[2]).slice(0, 10) : null;
}

interface GqlThreadComment {
  author: { login: string } | null;
  body: string;
  createdAt: string;
}
interface GqlResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: {
          id: string;
          isResolved: boolean;
          isOutdated: boolean;
          path: string | null;
          comments: { nodes: GqlThreadComment[] };
        }[];
      };
    } | null;
  };
}

/** Where the agent's branch stands relative to the project's main line. */
export interface BranchState {
  exists: boolean;
  lastCommitAt: number | null;
  /** Commits on the default branch that this branch does NOT have. 0 = fresh. */
  behindMain: number | null;
}

export async function branchStateFor(
  octokit: Octokit,
  repoFull: string,
  branch: string
): Promise<BranchState> {
  const { owner, repo } = splitRepo(repoFull);
  try {
    const { data } = await octokit.rest.repos.getBranch({ owner, repo, branch });
    const lastCommitAt = Date.parse(data.commit.commit.committer?.date ?? "") || null;
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const { data: cmp } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${branch}...${repoData.default_branch}`,
    });
    return { exists: true, lastCommitAt, behindMain: cmp.ahead_by };
  } catch {
    return { exists: false, lastCommitAt: null, behindMain: null };
  }
}

/** Files a PR touches (first 100) — used for overlap detection across tasks. */
export async function prChangedFiles(octokit: Octokit, repoFull: string, pr: number): Promise<string[]> {
  const { owner, repo } = splitRepo(repoFull);
  const { data } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: pr, per_page: 100 });
  return data.map((f) => f.filename);
}

/** All `agent/<name>/<issue>` branches in a repo, grouped by agent. */
export async function agentBranches(
  octokit: Octokit,
  repoFull: string
): Promise<Record<string, { branch: string; issue: number }[]>> {
  const { owner, repo } = splitRepo(repoFull);
  const { data } = await octokit.rest.repos.listBranches({ owner, repo, per_page: 100 });
  const map: Record<string, { branch: string; issue: number }[]> = {};
  for (const b of data) {
    const m = b.name.match(/^agent\/([a-z0-9-]+)\/(\d+)$/);
    if (m) (map[m[1]] ??= []).push({ branch: b.name, issue: parseInt(m[2], 10) });
  }
  return map;
}

export async function unresolvedThreads(
  octokit: Octokit,
  repoFull: string,
  pr: number
): Promise<ThreadOverview> {
  const { owner, repo } = splitRepo(repoFull);
  const data = await octokit.graphql<GqlResponse>(
    `query($owner: String!, $name: String!, $pr: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $pr) {
          reviewThreads(first: 50) {
            nodes {
              id
              isResolved
              isOutdated
              path
              comments(first: 50) {
                nodes { author { login } body createdAt }
              }
            }
          }
        }
      }
    }`,
    { owner, name: repo, pr }
  );

  const threads = data.repository.pullRequest?.reviewThreads.nodes ?? [];
  const withComments = threads.filter((t) => t.comments.nodes.length > 0);
  const open = withComments
    .filter((t) => !t.isResolved)
    .map((t) => {
      const comments = t.comments.nodes;
      const first = comments[0];
      const last = comments[comments.length - 1];
      const lastLogin = last.author?.login ?? "";
      // Attribution: an agent-msg header in the comment identifies the true
      // speaker even when several agents post via the same account.
      const firstMsg = parseMessage(first.body);
      const lastMsg = parseMessage(last.body);
      // Whose turn: the manager (bot or header) speaking last leaves the junior
      // owing a reply; a junior speaking last leaves the reviewer side to respond.
      const lastIsManager = lastMsg ? lastMsg.from === "manager" : lastLogin.endsWith("[bot]");
      return {
        id: t.id,
        path: t.path,
        firstAuthor: firstMsg?.from ?? first.author?.login ?? "unknown",
        firstSnippet: first.body.replace(/<!--[\s\S]*?-->/g, "").trim().slice(0, 140),
        lastAuthor: lastMsg?.from ?? lastLogin ?? "unknown",
        lastAt: Date.parse(last.createdAt) || Date.now(),
        replies: comments.length - 1,
        waitingOn: lastIsManager ? ("agent" as const) : ("reviewer" as const),
        fixCommit: extractFixCommit(last.body),
      };
    });
  return { open, resolvedCount: withComments.length - open.length, total: withComments.length };
}

/** Reply inside a review conversation (same thread, not a new top-level comment). */
export async function replyToThread(octokit: Octokit, threadId: string, body: string): Promise<void> {
  await octokit.graphql(
    `mutation($threadId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
        comment { id }
      }
    }`,
    { threadId, body }
  );
}

/** Mark a review conversation resolved. */
export async function resolveThread(octokit: Octokit, threadId: string): Promise<void> {
  await octokit.graphql(
    `mutation($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) { thread { id } }
    }`,
    { threadId }
  );
}
