/**
 * Secret-scan CI hook (M3-4 surface).
 *
 * Runs `scanOutput` from `src/guard/secretscan.ts` over the diff introduced by this
 * push/PR and exits non-zero if any credential pattern is found. Zero LLM cost — pure
 * regex. Intended to run in CI as a required status check.
 *
 *   npx tsx scripts/secret-scan.ts
 *
 * Detects the base ref via `BASE_SHA` env (set by the workflow) or falls back to
 * `origin/main` when run locally.
 */

import { execSync } from "node:child_process";
import { scanOutput } from "../src/guard/secretscan.js";

function run(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
}

const baseSha = process.env.BASE_SHA ?? "origin/main";
const headSha = process.env.GITHUB_SHA ?? "HEAD";

// Only scan added/modified text files — skip binaries, lockfiles, and vendored dirs.
let diff: string;
try {
  diff = run(
    `git diff --no-color --unified=0 ${baseSha}...${headSha} -- . ':(exclude)package-lock.json' ':(exclude)node_modules' ':(exclude)dist' ':(exclude)*.lock'`,
  );
} catch (error: unknown) {
  console.error(`secret-scan: Failed to run git diff between ${baseSha} and ${headSha}.`);
  console.error("This often happens in CI if the repository was shallow-cloned (fetch-depth: 1).");
  console.error("Ensure the base branch is fetched or checkout with 'fetch-depth: 0'.");
  const stderr = (error as { stderr?: Buffer }).stderr;
  if (stderr) console.error(`Git error: ${stderr.toString().trim()}`);
  process.exit(1);
}

if (!diff.trim()) {
  console.log("secret-scan: no diff to scan, exiting clean.");
  process.exit(0);
}

const result = scanOutput(diff);
if (result.clean) {
  console.log(`secret-scan: clean (${diff.length} bytes scanned).`);
  process.exit(0);
}

console.error(`secret-scan: ${result.findings.length} finding(s) — blocking merge:`);
for (const finding of result.findings) {
  console.error(`  - ${finding}`);
}
console.error("\nRedacted diff excerpt:");
console.error(result.redacted.slice(0, 2000));
process.exit(1);
