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

/** Pure: assemble the Devin Local prompt — mirror of buildDevinPrompt in devin.ts. */
export function buildDevinLocalPrompt(ctx: WakeContext): string {
  return `${ctx.brief}

---
Operating instructions (Foreman):
- Repository: ${ctx.repo}. Work on a new branch \`${ctx.branch}\`.
- Open a pull request whose body contains \`Closes #${ctx.issueNumber}\`.
- When finished, comment on the PR exactly: \`@hayssamhob ✅ #${ctx.issueNumber} done — <one sentence>\`.
- Stay strictly in scope. Do NOT touch auth, payments, secrets, database migrations, deletions, or spend limits; if the task seems to require any of these, stop and say so on the issue instead of proceeding.`;
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
