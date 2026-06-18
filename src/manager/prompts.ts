/** Prompt builders for the Fable manager. Each expects a single JSON object back. */

export function decomposePrompt(args: {
  epicTitle: string;
  epicBody: string;
  agents: string[];
  repo: string;
}): string {
  return `You are the engineering manager of a fleet of junior AI coding agents.
Decompose the following epic from ${args.repo} into independent, junior-sized tasks.

Rules:
- Each task must be completable by one agent in one session without coordinating with another task.
- Tasks must not overlap in the files they touch. If two pieces of work share files, merge them into one task.
- Write each spec so it can be handed to a coding agent verbatim: include acceptance criteria, the files in scope, and an explicit "do not touch" list.
- Available agents and their routing names: ${args.agents.join(", ")}. Assign each task to the best-suited agent.

EPIC TITLE: ${args.epicTitle}

EPIC BODY:
${args.epicBody}

Respond with ONLY a JSON object, no prose, in this exact shape:
{"tasks": [{"title": "...", "agent": "<one of: ${args.agents.join("|")}>", "spec": "<full markdown spec>"}]}`;
}

export function reviewPrompt(args: {
  repo: string;
  taskIssue: number;
  taskSpec: string;
  prTitle: string;
  prBody: string;
  diff: string;
  round: number;
  openPoints: string[]; // unresolved points from previous review rounds
}): string {
  const previous =
    args.openPoints.length > 0
      ? `\nPREVIOUSLY REQUESTED FIXES (still marked open — judge each against the current diff):
${args.openPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n`
      : "";
  return `You are the engineering manager reviewing a pull request authored by a junior AI coding agent.
This is revision round ${args.round}. Judge the diff strictly against the task spec.

Approve ONLY if: the spec's acceptance criteria are met, no out-of-scope files were touched, the change is correct, and tests cover the change where the spec demands it. When in doubt, request changes — be specific enough that a junior agent can act on each point without asking questions.

TASK SPEC (issue #${args.taskIssue} in ${args.repo}):
${args.taskSpec}
${previous}
PR TITLE: ${args.prTitle}
PR BODY:
${args.prBody}

DIFF:
${args.diff}

Respond with ONLY a JSON object, no prose, no code fences, in this exact shape:
{"verdict": "approve" | "request_changes", "summary": "<2-5 sentence overall assessment>", "plainSummary": "<2-4 sentences for a non-technical business owner: what this change does for them in plain words, what they can now do or expect, and any caveat worth knowing. No jargon, no file names.>", "addressedPointNumbers": [<numbers from the PREVIOUSLY REQUESTED FIXES list that ARE now properly addressed>], "points": ["<NEW actionable revision point>", ...]}
"points" must be empty when approving and must NOT repeat previously requested fixes that remain open — those stay tracked automatically.`;
}
