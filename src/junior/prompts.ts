import type { ThreadSummary } from "../threads.js";

/** Prompt builders for the in-process Claude junior. Each expects one JSON object back. */

export interface JuniorReport {
  summary?: string;
  didNotDo?: string;
  testsRun?: string;
  testsPassed?: boolean;
  testsOutput?: string;
  prTitle?: string;
  pointFixes?: { n: number; what: string }[];
  threadReplies?: { n: number; reply: string; fixed?: boolean }[];
}

const COMMON_RULES = `Rules:
- You are inside a checkout of the repository; the right branch is already checked out for you.
- Do NOT use git (no commit, push, branch, stash, or config) — the harness commits, pushes, and talks to GitHub for you.
- Stay strictly inside the task's scope; honor any "do not touch" list in the spec.
- Match the repository's existing style, naming, and test conventions.
- If the repository has tests, run them and make them pass before finishing. Report honestly — the manager verifies your claims against the diff.`;

export function workPrompt(args: { repoFull: string; issue: number; title: string; spec: string; branch: string }): string {
  return `You are "claude", a junior AI software engineer on a team run by an AI engineering manager.
Repository: ${args.repoFull} — branch \`${args.branch}\`.

${COMMON_RULES}

Implement EXACTLY this task:

TASK #${args.issue}: ${args.title}

${args.spec}

When done, output ONLY a JSON object (no prose, no code fences):
{"summary": "<what you did, as 3-8 markdown bullet points>", "didNotDo": "<anything the spec asked that you could not do, and why — or empty string>", "testsRun": "<test command(s) you ran and their results — or 'none'>", "testsPassed": <true if all tests passed, false if any failed or you did not run them>, "testsOutput": "<last ~20 lines of test output — only if testsPassed is false>", "prTitle": "<concise PR title for this change>"}`;
}

export function revisionPrompt(args: {
  repoFull: string;
  issue: number;
  branch: string;
  round: number;
  points: string[];
  threads: ThreadSummary[];
}): string {
  const pointsBlock =
    args.points.length > 0
      ? `MANAGER'S REVISION POINTS (address every one):
${args.points.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
      : "No numbered revision points this round.";
  const threadsBlock =
    args.threads.length > 0
      ? `
OPEN REVIEW CONVERSATIONS (each needs a reply; fix the code when the comment is right, explain when it is not):
${args.threads
  .map((t, i) => `${i + 1}. ${t.path ? `[${t.path}] ` : ""}"${t.firstSnippet}" (last word from ${t.lastAuthor})`)
  .join("\n")}`
      : "";

  return `You are "claude", a junior AI software engineer. Your pull request on ${args.repoFull} (task #${args.issue}, branch \`${args.branch}\`) received review feedback — this is revision round ${args.round}.

${COMMON_RULES}

${pointsBlock}
${threadsBlock}

Make the code changes needed to address the feedback above.

When done, output ONLY a JSON object (no prose, no code fences):
{"summary": "<overall, 1-3 sentences>", "pointFixes": [{"n": <revision point number>, "what": "<what you changed — or why no change was warranted>"}], "threadReplies": [{"n": <conversation number>, "reply": "<your reply to post in that conversation>", "fixed": <true if you changed code for it>}], "testsRun": "<test command(s) and results — or 'none'>"}`;
}
