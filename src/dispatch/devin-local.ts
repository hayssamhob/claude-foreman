/**
 * Devin Local adapter (M6-4b) — the self-referential wake-up.
 *
 * `agent:devin-local` on an issue -> fire `devin -p --prompt-file <file>` headlessly.
 * Devin is autonomous — it handles the repo, branch, edits, commit, push, and PR
 * itself (same behaviour as the Cloud adapter, different runtime). Runs on a
 * self-hosted runner with Devin Desktop installed (set `DISPATCH_RUNNER=self-hosted`).
 *
 * Dry-run when the `devin` binary is not in PATH — never throws on a missing CLI.
 *
 * Environment persistence (critical for self-hosted runners):
 *   - HOME is forced to the real user home (runner overrides it to _work/_temp)
 *   - GH_TOKEN is injected from the persistent PAT in ~/.zshrc (runner token is ephemeral)
 *   - PATH is augmented with common user bin dirs (runner PATH lacks gh, git, etc.)
 *   - Devin credentials at ~/.local/share/devin/credentials.toml are found via correct HOME
 */
import { execFileSync, spawn } from "node:child_process";
import { writeFileSync, openSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import type { FighterAdapter, WakeContext, WakeResult } from "./adapter.js";

/** The real user home — not the runner's overridden HOME. */
const USER_HOME = homedir();

/**
 * Extract the persistent GitHub PAT from ~/.zshrc.
 * The runner's GITHUB_TOKEN is ephemeral and expires when the action completes;
 * Devin is detached and survives after the action, so it needs a persistent token.
 */
function persistentGitHubToken(): string | null {
  // 1. Try DEVIN_GH_TOKEN env var (highest priority — explicit override)
  if (process.env.DEVIN_GH_TOKEN) return process.env.DEVIN_GH_TOKEN;

  // 2. Try ~/.zshrc (where the user stores their persistent PAT)
  try {
    const zshrc = join(USER_HOME, ".zshrc");
    if (existsSync(zshrc)) {
      const content = readFileSync(zshrc, "utf8");
      const match = content.match(/export\s+GITHUB_TOKEN=(ghp_[a-zA-Z0-9_]+)/);
      if (match && match[1]) return match[1];
    }
  } catch {
    // .zshrc not readable — fall through
  }

  // 3. Try `gh auth token` (local CLI auth)
  try {
    const token = execFileSync("gh", ["auth", "token"], { stdio: "pipe", env: { ...process.env, HOME: USER_HOME } })
      .toString()
      .trim();
    if (token.startsWith("ghp_")) return token;
  } catch {
    // gh CLI not available — fall through
  }

  return null;
}

/**
 * Build the environment for the detached Devin process.
 *
 * The GitHub Actions runner sets HOME to a temp dir and GITHUB_TOKEN to an
 * ephemeral token that expires when the action completes. Since Devin is
 * detached and survives after the action, we must:
 *   1. Restore HOME to the real user home (so Devin finds credentials.toml)
 *   2. Override GH_TOKEN/GITHUB_TOKEN with the persistent PAT
 *   3. Augment PATH with user bin dirs (gh, git, node, etc.)
 */
function buildChildEnv(): Record<string, string> {
  const childEnv: Record<string, string> = { ...process.env } as Record<string, string>;

  // 1. Restore HOME to the real user home
  // The runner overrides HOME to _work/_temp; Devin needs the real home to find
  // ~/.local/share/devin/credentials.toml and ~/.config/devin/config.json
  childEnv.HOME = USER_HOME;

  // 2. Remove the runner's tracking ID (prevents GitHub from killing our process tree)
  delete childEnv.RUNNER_TRACKING_ID;

  // 3. Override the ephemeral GITHUB_TOKEN with the persistent PAT
  const pat = persistentGitHubToken();
  if (pat) {
    childEnv.GH_TOKEN = pat;
    childEnv.GITHUB_TOKEN = pat;
  }

  // 4. Augment PATH with common user bin dirs that the runner PATH may lack
  const extraPaths = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    join(USER_HOME, ".local/bin"),
    join(USER_HOME, ".gh/bin"),
    "/Applications/Devin.app/Contents/Resources/app/extensions/windsurf/devin/bin",
  ];
  const currentPath = childEnv.PATH || "";
  const missing = extraPaths.filter((p) => !currentPath.includes(p));
  if (missing.length > 0) {
    childEnv.PATH = [...missing, currentPath].join(":");
  }

  return childEnv;
}

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
    let binToUse = DEVIN_BIN;
    try {
      execFileSync(DEVIN_BIN, ["--version"], { stdio: "pipe" });
    } catch {
      try {
        execFileSync("devin", ["--version"], { stdio: "pipe" });
        binToUse = "devin";
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

    // Step 2 — build the persistent environment for the detached process
    const childEnv = buildChildEnv();

    // Log auth status for debugging
    const hasPat = !!childEnv.GH_TOKEN;
    if (!hasPat) {
      console.warn("[devin-local] WARNING: No persistent GitHub token found — Devin may not be able to push/PR");
    }

    // Step 3 — write the prompt to a temp file and fire the CLI asynchronously
    const prompt = buildDevinLocalPrompt(ctx);
    const tmpFile = join(tmpdir(), `devin-task-${ctx.issueNumber}-${Date.now()}.md`);
    writeFileSync(tmpFile, prompt);

    const out = openSync("/tmp/devin-local-out.log", "a");
    const err = openSync("/tmp/devin-local-err.log", "a");

    const child = spawn(binToUse, ["--prompt-file", tmpFile, "-p", "--permission-mode", "dangerous"], {
      stdio: ["ignore", out, err],
      detached: true,
      cwd: process.cwd(),
      env: childEnv,
    });
    child.unref();

    // Step 4 — return.
    return {
      status: "woken",
      detail: `Devin Local session started in background (PID ${child.pid}) for issue #${ctx.issueNumber} via temp file. HOME=${childEnv.HOME}, GH_TOKEN=${hasPat ? "set" : "MISSING"}`,
    };
  },
};
