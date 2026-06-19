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
import { execFileSync, spawn } from "node:child_process";
import { writeFileSync, openSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FighterAdapter, WakeContext, WakeResult } from "./adapter.js";

/** Pure: assemble the lean Devin Local prompt. */
export function buildDevinLocalPrompt(ctx: WakeContext): string {
  return `Your task is Issue #${ctx.issueNumber} in ${ctx.repo}. Use the 'gh' CLI to read the issue body for the exact spec, work on a new branch '${ctx.branch}', open a PR with 'Closes #${ctx.issueNumber}', and comment '@hayssamhob ✅ #${ctx.issueNumber} done — <one sentence>' on the PR when finished. Stay strictly in scope (no auth, secrets, migrations, or spend limits).`;
}

export const devinLocalAdapter: FighterAdapter = {
  name: "devin-local",
  async wake(ctx: WakeContext): Promise<WakeResult> {
    // Step 1 — binary check (dry-run if devin not found).
    const DEVIN_BIN = process.env.DEVIN_BIN || "/Applications/Devin.app/Contents/Resources/app/extensions/windsurf/devin/bin/devin";
    let devinAvailable = true;
    try {
      execFileSync(DEVIN_BIN, ["--version"], { stdio: "pipe" });
    } catch {
      try {
        execFileSync("devin", ["--version"], { stdio: "pipe" });
      } catch {
        devinAvailable = false;
      }
    }
    if (!devinAvailable) {
      const prompt = buildDevinLocalPrompt(ctx);
      return {
        status: "dry-run",
        detail: `devin CLI not found at ${DEVIN_BIN} or PATH — would run: devin -p for #${ctx.issueNumber}. Prompt preview: ${prompt.slice(0, 200)}…`,
      };
    }

    // Step 2 — fire the CLI asynchronously so we don't block the daemon.
    const prompt = buildDevinLocalPrompt(ctx);
    const tmpFile = join(tmpdir(), `devin-task-${ctx.issueNumber}-${Date.now()}.md`);
    writeFileSync(tmpFile, prompt);

    let binToUse = DEVIN_BIN;
    try {
      execFileSync(DEVIN_BIN, ["--version"], { stdio: "pipe" });
    } catch {
      binToUse = "devin";
    }

    const childEnv = { ...process.env };
    delete childEnv.RUNNER_TRACKING_ID;

    // The user rule mandates the use of the PAT in ~/.zshrc because the GH action token
    // does not provide the right access for Devin. We extract it and override GH_TOKEN.
    try {
      // os and fs are already imported at the top, but we need readFileSync
      // Actually, writeFileSync and openSync are imported. Let's use dynamic import
      // or just require if it's compiled, but we can also just use the global process
      const homedir = require("node:os").homedir();
      const content = require("node:fs").readFileSync(join(homedir, ".zshrc"), "utf8");
      const match = content.match(/export\s+GITHUB_TOKEN=(ghp_[a-zA-Z0-9]+)/);
      if (match && match[1]) {
        childEnv.GITHUB_TOKEN = match[1];
        childEnv.GH_TOKEN = match[1];
      }
    } catch (e) {
      // Ignore if .zshrc doesn't exist or is unreadable
    }

    const out = openSync("/tmp/devin-local-out.log", "a");
    const err = openSync("/tmp/devin-local-err.log", "a");

    const child = spawn(binToUse, ["--prompt-file", tmpFile, "-p", "--permission-mode", "dangerous"], {
      stdio: ["ignore", out, err],
      detached: true,
      cwd: process.cwd(),
      env: childEnv,
    });
    child.unref();

    // Step 3 — return.
    return {
      status: "woken",
      detail: `Devin Local session started in background (PID ${child.pid}) for issue #${ctx.issueNumber} via temp file`,
    };
  },
};
