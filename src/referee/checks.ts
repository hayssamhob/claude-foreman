/**
 * Per-signal referee checks (M1-13).
 *
 * Splits the single `Manager Review` check into per-signal checks:
 *   - foreman/done-contract  (gating) — tests + acceptance criteria
 *   - foreman/coach-verdict   (gating) — approve / request-changes
 *   - foreman/readiness       (gating) — trust tier (L1/L2/L3)
 *   - foreman/cost            (informational neutral) — spend signal
 *   - foreman/stall           (informational neutral) — stall/circle signal
 *
 * Gating checks post as success/failure — they hard-block the merge.
 * Informational checks post as neutral — they signal process state but
 * never hard-block the artifact.
 *
 * M1-12: `doneContractFromCi` is the authoritative Checks-API oracle entry point.
 * The done-contract passes only when the GitHub Checks API reports green.
 */
import type { CiState } from "../threads.js";

/** The signal name for a per-signal check. */
export type CheckSignal =
  | "foreman/done-contract"
  | "foreman/coach-verdict"
  | "foreman/readiness"
  | "foreman/cost"
  | "foreman/stall";

/** Whether a check is gating (hard-blocks merge) or informational (neutral). */
export type CheckRole = "gating" | "informational";

/** The conclusion to post for a check. */
export type CheckConclusion = "success" | "failure" | "neutral" | "action_required";

/** A per-signal check definition. */
export interface SignalCheck {
  signal: CheckSignal;
  role: CheckRole;
  conclusion: CheckConclusion;
  title: string;
  summary: string;
}

/** Map a signal to its role (gating vs informational). */
export const SIGNAL_ROLES: Record<CheckSignal, CheckRole> = {
  "foreman/done-contract": "gating",
  "foreman/coach-verdict": "gating",
  "foreman/readiness": "gating",
  "foreman/cost": "informational",
  "foreman/stall": "informational",
};

/**
 * Build a per-signal check for the done-contract signal.
 * Gating: success only if tests pass AND acceptance criteria are met.
 */
export function doneContractCheck(opts: {
  testsPass: boolean;
  acceptanceCriteriaMet: boolean;
  testCount?: number;
  acCount?: number;
}): SignalCheck {
  const pass = opts.testsPass && opts.acceptanceCriteriaMet;
  const detail = [
    opts.testsPass ? `Tests: pass${opts.testCount !== undefined ? ` (${opts.testCount})` : ""}` : "Tests: FAIL",
    opts.acceptanceCriteriaMet ? `Acceptance criteria: met${opts.acCount !== undefined ? ` (${opts.acCount})` : ""}` : "Acceptance criteria: NOT met",
  ].join("\n");
  return {
    signal: "foreman/done-contract",
    role: "gating",
    conclusion: pass ? "success" : "failure",
    title: pass ? "Done-contract met" : "Done-contract NOT met",
    summary: detail,
  };
}

/**
 * M1-12: Build a done-contract check grounded in the authoritative GitHub Checks-API
 * oracle. The done-contract passes only when CI is green **and** AC is met.
 *
 * Mapping from CiState.overall:
 *   - "green"   → testsPass = true  (Checks API confirmed all checks passed)
 *   - "red"     → testsPass = false (at least one check is failing)
 *   - "pending" → testsPass = false (checks still running; contract not yet satisfied)
 *   - "none"    → testsPass = true  (no CI configured; no hard-block, consistent with
 *                                    preFilterReview and mergeGate behaviour)
 */
export function doneContractFromCi(ci: CiState, acceptanceCriteriaMet: boolean): SignalCheck {
  const testsPass = ci.overall === "green" || ci.overall === "none";
  const pass = testsPass && acceptanceCriteriaMet;
  const ciLine =
    ci.overall === "green" ? `CI: green (${ci.detail})` :
    ci.overall === "none"  ? "CI: none configured" :
    ci.overall === "pending" ? `CI: pending — ${ci.detail}` :
    `CI: red — ${ci.detail}`;
  const detail = [
    ciLine,
    acceptanceCriteriaMet ? "Acceptance criteria: met" : "Acceptance criteria: NOT met",
  ].join("\n");
  return {
    signal: "foreman/done-contract",
    role: "gating",
    conclusion: pass ? "success" : "failure",
    title: pass ? "Done-contract met" : "Done-contract NOT met",
    summary: detail,
  };
}

/**
 * Build a per-signal check for the coach-verdict signal.
 * Gating: success only if the coach approved.
 */
export function coachVerdictCheck(opts: {
  verdict: "approve" | "request-changes" | "pending";
  reasons?: string;
}): SignalCheck {
  const conclusion: CheckConclusion =
    opts.verdict === "approve" ? "success" :
    opts.verdict === "request-changes" ? "failure" :
    "action_required";
  return {
    signal: "foreman/coach-verdict",
    role: "gating",
    conclusion,
    title: opts.verdict === "approve" ? "Coach approved" :
           opts.verdict === "request-changes" ? "Coach requested changes" :
           "Coach review pending",
    summary: opts.reasons ?? `Verdict: ${opts.verdict}`,
  };
}

/**
 * Build a per-signal check for the readiness signal.
 * Gating: success at L2/L3, failure at L1 (report-only can't auto-merge).
 */
export function readinessCheck(opts: {
  tier: "L1" | "L2" | "L3";
  score?: number;
  blockers?: string[];
}): SignalCheck {
  const pass = opts.tier !== "L1";
  const summary = [
    `Trust tier: ${opts.tier}${opts.score !== undefined ? ` (score: ${opts.score}/100)` : ""}`,
    opts.blockers && opts.blockers.length > 0 ? `Blockers: ${opts.blockers.join("; ")}` : "No blockers",
  ].join("\n");
  return {
    signal: "foreman/readiness",
    role: "gating",
    conclusion: pass ? "success" : "failure",
    title: pass ? `Trust tier: ${opts.tier} — auto-merge allowed` : `Trust tier: ${opts.tier} — report-only, no auto-merge`,
    summary,
  };
}

/**
 * Build a per-signal check for the cost signal.
 * Informational: always neutral — signals spend but never hard-blocks.
 */
export function costCheck(opts: {
  spentUsd?: number;
  budgetUsd?: number;
  tokensUsed?: number;
}): SignalCheck {
  const overBudget = opts.budgetUsd !== undefined && opts.spentUsd !== undefined && opts.spentUsd > opts.budgetUsd;
  const summary = [
    opts.spentUsd !== undefined ? `Spent: $${opts.spentUsd.toFixed(2)}` : "Spent: (not tracked)",
    opts.budgetUsd !== undefined ? `Budget: $${opts.budgetUsd.toFixed(2)}` : "Budget: (none set)",
    opts.tokensUsed !== undefined ? `Tokens: ${opts.tokensUsed}` : "",
  ].filter(Boolean).join("\n");
  return {
    signal: "foreman/cost",
    role: "informational",
    conclusion: "neutral",
    title: overBudget ? `Over budget ($${opts.spentUsd!.toFixed(2)} / $${opts.budgetUsd!.toFixed(2)})` : "Cost signal",
    summary,
  };
}

/**
 * Build a per-signal check for the stall signal.
 * Informational: always neutral — signals stall/circle but never hard-blocks.
 * The stall/circle detector escalates separately; this check just records the signal.
 */
export function stallCheck(opts: {
  stalled: boolean;
  rounds?: number;
  reason?: string;
}): SignalCheck {
  return {
    signal: "foreman/stall",
    role: "informational",
    conclusion: "neutral",
    title: opts.stalled ? `Stalled after ${opts.rounds ?? "?"} rounds` : "No stall detected",
    summary: opts.stalled
      ? `Stall detected: ${opts.reason ?? "unknown reason"} (rounds: ${opts.rounds ?? "?"})`
      : "No stall or circle pattern detected.",
  };
}

/**
 * Build all per-signal checks from a single review pass.
 * Returns an array of SignalCheck, one per signal.
 */
export function buildAllChecks(opts: {
  testsPass: boolean;
  acceptanceCriteriaMet: boolean;
  testCount?: number;
  acCount?: number;
  verdict: "approve" | "request-changes" | "pending";
  verdictReasons?: string;
  tier: "L1" | "L2" | "L3";
  tierScore?: number;
  tierBlockers?: string[];
  spentUsd?: number;
  budgetUsd?: number;
  tokensUsed?: number;
  stalled: boolean;
  stallRounds?: number;
  stallReason?: string;
}): SignalCheck[] {
  return [
    doneContractCheck({
      testsPass: opts.testsPass,
      acceptanceCriteriaMet: opts.acceptanceCriteriaMet,
      testCount: opts.testCount,
      acCount: opts.acCount,
    }),
    coachVerdictCheck({
      verdict: opts.verdict,
      reasons: opts.verdictReasons,
    }),
    readinessCheck({
      tier: opts.tier,
      score: opts.tierScore,
      blockers: opts.tierBlockers,
    }),
    costCheck({
      spentUsd: opts.spentUsd,
      budgetUsd: opts.budgetUsd,
      tokensUsed: opts.tokensUsed,
    }),
    stallCheck({
      stalled: opts.stalled,
      rounds: opts.stallRounds,
      reason: opts.stallReason,
    }),
  ];
}

/**
 * Check if all gating checks pass.
 * Informational checks are ignored (they're neutral, never hard-block).
 */
export function allGatingPass(checks: SignalCheck[]): boolean {
  return checks
    .filter((c) => c.role === "gating")
    .every((c) => c.conclusion === "success");
}
