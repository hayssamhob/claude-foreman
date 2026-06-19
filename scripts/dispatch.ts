/**
 * The wake-up router (M6-1). Invoked by .github/workflows/dispatch.yml on issues.labeled.
 *
 *   npx tsx scripts/dispatch.ts --agent agent:devin --issue 87
 *
 * Maps an `agent:X` label to its adapter, builds the WakeContext from the issue (the body
 * is the Coach's grilled brief), fires the adapter, and posts a GitHub-visible audit
 * comment. Unknown agents are a no-op (the Coach handles them). GitHub is the hub: the only
 * inputs are the label + issue number; the only side effects are the Fighter waking + a comment.
 */
import { execFileSync } from "node:child_process";
import { branchFor, noopAdapter, parseAgent, type FighterAdapter, type WakeContext } from "../src/dispatch/adapter.js";
import { devinAdapter } from "../src/dispatch/devin.js";

const ADAPTERS: Record<string, FighterAdapter> = {
  devin: devinAdapter,
  noop: noopAdapter,
};

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8" });
}

async function main(): Promise<void> {
  const rawLabel = arg("--agent") ?? "";
  const agent = parseAgent(rawLabel);
  if (!agent) {
    console.log(`[dispatch] '${rawLabel}' is not an agent:* label — skipping`);
    return;
  }
  const issueNumber = Number(arg("--issue"));
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    console.error(`[dispatch] bad --issue '${arg("--issue")}'`);
    process.exit(1);
  }

  const adapter = ADAPTERS[agent];
  if (!adapter) {
    console.log(`[dispatch] no adapter for '${agent}' yet — leaving for the Coach`);
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY ?? process.env.AUDIT_REPO ?? "";
  const repoArgs = repo ? ["--repo", repo] : [];
  const issue = JSON.parse(
    gh(["issue", "view", String(issueNumber), ...repoArgs, "--json", "title,body"])
  ) as { title: string; body: string };

  const ctx: WakeContext = {
    repo,
    issueNumber,
    agent,
    brief: issue.body ?? "",
    branch: branchFor(issueNumber, issue.title ?? ""),
  };

  const result = await adapter.wake(ctx);
  console.log(`[dispatch] ${agent} → ${result.status}: ${result.detail.slice(0, 300)}`);

  // GitHub-visible audit trail (best-effort; never fail the run over a comment).
  const note =
    result.status === "woken"
      ? `🥊 Woke \`${agent}\` for this task — ${result.detail}`
      : result.status === "dry-run"
        ? `🟡 \`${agent}\` adapter ran in dry-run (no credentials in the runner). ${result.detail}`
        : `ℹ️ \`${agent}\`: ${result.detail}`;
  try {
    gh(["issue", "comment", String(issueNumber), ...repoArgs, "--body", note]);
  } catch (e) {
    console.error(`[dispatch] could not post audit comment: ${String(e).slice(0, 120)}`);
  }
}

main().catch((e) => {
  console.error(`[dispatch] fatal: ${e}`);
  process.exit(1);
});
