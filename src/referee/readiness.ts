import type { Octokit } from "../octokit.js";

/**
 * ReadinessScore (M3-1) — `foreman audit`: tests/CI/branch-protection → trust tier.
 *
 * Reads CI/tests via the Checks/repo scopes; reading branch-protection config
 * requires the opt-in `administration: read` scope (B.a). Prints a tier + reasons.
 * L3 is refused without branch protection.
 *
 * Trust ladder:
 *   L1 (report-only)  — draft PRs a human marks ready; no auto-merge
 *   L2 (patch-only)   — auto-merge low-risk patches; human reviews the rest
 *   L3 (auto-merge)   — required foreman/* checks under branch protection;
 *                       not even a human can merge around the referee
 *
 * Hard rules:
 *   - No tests → floored at L1 (no execution oracle → test-grounded judge collapses)
 *   - No CI    → floored at L1 (no trusted done-contract oracle)
 *   - No branch protection → refused at L3 (enforcement needs GitHub's merge rules)
 */

/** The trust tier assigned by the ReadinessScore. */
export type TrustTier = "L1" | "L2" | "L3";

/** The signals the ReadinessScore reads from the repo. */
export interface RepoSignals {
  hasTests: boolean; // does the repo have test files?
  hasCI: boolean; // does the repo have GitHub Actions CI?
  hasBranchProtection: boolean; // is branch protection on for the default branch?
  testCount: number; // number of test files found
  ciWorkflows: string[]; // names of CI workflow files
  requiredChecks: string[]; // required status checks (from branch protection)
  hasCodeowners: boolean; // does the repo have a CODEOWNERS file?
}

/** The result of a ReadinessScore audit. */
export interface ReadinessResult {
  tier: TrustTier;
  score: number; // 0-100
  reasons: string[]; // why this tier was assigned
  blockers: string[]; // what prevents a higher tier
  signals: RepoSignals; // the raw signals read
}

/**
 * Compute the ReadinessScore from repo signals.
 * Pure function — the caller (the Probot app or CLI) fetches the signals
 * from the GitHub API and passes them in.
 */
export function computeReadiness(signals: RepoSignals): ReadinessResult {
  const reasons: string[] = [];
  const blockers: string[] = [];

  // Hard floor: no tests → L1
  if (!signals.hasTests) {
    blockers.push("No test files found — floored at L1 (no execution oracle)");
    return {
      tier: "L1",
      score: 10,
      reasons: ["Repo has no tests — the test-grounded judge has no oracle to ground on."],
      blockers,
      signals,
    };
  }

  // Hard floor: no CI → L1
  if (!signals.hasCI) {
    blockers.push("No CI workflows found — floored at L1 (no trusted done-contract oracle)");
    return {
      tier: "L1",
      score: 25,
      reasons: ["Repo has tests but no CI — the done-contract cannot be verified by GitHub's own machinery."],
      blockers,
      signals,
    };
  }

  reasons.push(`Tests found (${signals.testCount} test files)`);
  reasons.push(`CI found (${signals.ciWorkflows.length} workflow(s): ${signals.ciWorkflows.join(", ")})`);

  // L2: tests + CI
  let tier: TrustTier = "L2";
  let score = 50;

  if (signals.hasCodeowners) {
    reasons.push("CODEOWNERS file found — exclusion list is partially enforced natively");
    score += 10;
  }

  // L3: tests + CI + branch protection
  if (signals.hasBranchProtection) {
    if (signals.requiredChecks.length > 0) {
      reasons.push(`Branch protection on with required checks: ${signals.requiredChecks.join(", ")}`);
      tier = "L3";
      score = 90;
    } else {
      reasons.push("Branch protection on but no required checks configured");
      blockers.push("Branch protection has no required checks — L3 needs foreman/* checks to be required");
      score = 70;
    }
  } else {
    blockers.push("No branch protection — L3 refused (enforcement needs GitHub's merge rules)");
    if (signals.hasCodeowners) {
      score = 60;
    }
  }

  return { tier, score, reasons, blockers, signals };
}

/** Format the ReadinessScore as a human-readable report. */
export function formatReadinessReport(result: ReadinessResult): string {
  const lines = [
    `## ReadinessScore — foreman audit`,
    ``,
    `**Trust tier: ${result.tier}** (score: ${result.score}/100)`,
    ``,
    `### Reasons`,
    ...result.reasons.map((r) => `- ✅ ${r}`),
    ``,
  ];

  if (result.blockers.length > 0) {
    lines.push(`### Blockers (preventing a higher tier)`);
    lines.push(...result.blockers.map((b) => `- ⚠️  ${b}`));
    lines.push(``);
  }

  lines.push(`### Signals`);
  lines.push(`| Signal | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Tests | ${result.signals.hasTests ? "yes" : "no"} (${result.signals.testCount} files) |`);
  lines.push(`| CI | ${result.signals.hasCI ? "yes" : "no"} (${result.signals.ciWorkflows.length} workflows) |`);
  lines.push(`| Branch protection | ${result.signals.hasBranchProtection ? "yes" : "no"} |`);
  lines.push(`| Required checks | ${result.signals.requiredChecks.length > 0 ? result.signals.requiredChecks.join(", ") : "none"} |`);
  lines.push(`| CODEOWNERS | ${result.signals.hasCodeowners ? "yes" : "no"} |`);
  lines.push(``);
  lines.push(`### Trust ladder`);
  lines.push(`- **L1** (report-only): draft PRs, human reviews everything — *no auto-merge*`);
  lines.push(`- **L2** (patch-only): auto-merge low-risk patches, human reviews the rest`);
  lines.push(`- **L3** (auto-merge): required foreman/* checks under branch protection — *not even a human can merge around the referee*`);

  return lines.join("\n");
}

/**
 * Read a repo's trust-tier signals from GitHub and compute its ReadinessScore.
 *
 * Falls back gracefully when branch protection can't be read (needs the
 * opt-in `administration:read` scope), so callers always get a tier.
 */
export async function readReadiness(octokit: Octokit, owner: string, repo: string): Promise<ReadinessResult> {
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: defaultBranch,
    recursive: "1",
  });

  const entries = tree.tree ?? [];
  const testFiles = entries.filter(
    (e) => e.type === "blob" && /\.(test|spec)\.(ts|tsx|js|jsx|py|go|rs|java)$/i.test(e.path ?? "")
  );
  const workflows = entries.filter(
    (e) => e.type === "blob" && /^\.github\/workflows\/.+\.(yml|yaml)$/i.test(e.path ?? "")
  );
  const hasCodeowners = entries.some(
    (e) => e.type === "blob" && (e.path === "CODEOWNERS" || e.path === ".github/CODEOWNERS")
  );

  let hasBranchProtection = false;
  let requiredChecks: string[] = [];
  try {
    const { data: bp } = await octokit.rest.repos.getBranchProtection({
      owner,
      repo,
      branch: defaultBranch,
    });
    hasBranchProtection = true;
    const contexts = bp.required_status_checks?.contexts ?? [];
    const checks = (bp.required_status_checks?.checks ?? []).map((c) => (typeof c === "string" ? c : c.context));
    requiredChecks = [...contexts, ...checks].filter(Boolean);
  } catch {
    // Missing admin:read scope or no branch protection — treat as unprotected.
  }

  return computeReadiness({
    hasTests: testFiles.length > 0,
    hasCI: workflows.length > 0,
    hasBranchProtection,
    testCount: testFiles.length,
    ciWorkflows: workflows.map((w) => w.path?.split("/").pop() ?? "").filter(Boolean),
    requiredChecks,
    hasCodeowners,
  });
}
