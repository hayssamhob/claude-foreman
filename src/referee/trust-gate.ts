/**
 * Trust tier gate for sweepAutoMerge (M1-9).
 *
 * Gates auto-merge behind the L2 trust tier + a low-risk classification.
 * The existing mergeGate already checks CI/threads/hold/mergeable — this
 * adds two more gates:
 *   1. Trust tier must be >= L2 (L1 = report-only, no auto-merge)
 *   2. The PR must be classified as low-risk (no banned paths, small diff)
 */

import type { TrustTier } from "./readiness.js";

/** The risk classification of a PR. */
export type RiskClass = "low" | "medium" | "high";

/** The inputs for the trust gate. */
export interface TrustGateInput {
  tier: TrustTier;
  riskClass: RiskClass;
  changedFileCount: number;
  touchesBannedPath: boolean;
  isExcludedScope: boolean;
}

/** The result of the trust gate check. */
export interface TrustGateResult {
  ok: boolean;
  reason: string;
  tier: TrustTier;
  riskClass: RiskClass;
}

/**
 * Classify a PR's risk level based on its characteristics.
 * Pure function — the caller provides the signals.
 */
export function classifyRisk(opts: {
  changedFileCount: number;
  touchesBannedPath: boolean;
  isExcludedScope: boolean;
  linesChanged?: number;
}): RiskClass {
  // Banned paths → always high risk
  if (opts.touchesBannedPath) return "high";
  // Excluded scope → always high risk
  if (opts.isExcludedScope) return "high";
  // Large diffs → medium risk
  if (opts.linesChanged !== undefined && opts.linesChanged > 500) return "medium";
  if (opts.changedFileCount > 10) return "medium";
  // Everything else → low risk
  return "low";
}

/**
 * The trust gate — checks if auto-merge is allowed for this PR.
 *
 * Rules:
 *   - L1 (report-only) → never auto-merge, always escalate
 *   - L2 (patch-only) → auto-merge only low-risk PRs
 *   - L3 (auto-merge) → auto-merge low and medium risk; high-risk still escalates
 *   - High risk (banned paths / excluded scope) → always escalate, regardless of tier
 */
export function trustGate(input: TrustGateInput): TrustGateResult {
  // High risk → always escalate, regardless of tier
  if (input.riskClass === "high") {
    const reasons: string[] = [];
    if (input.touchesBannedPath) reasons.push("touches a banned path on the exclusion list");
    if (input.isExcludedScope) reasons.push("is in an excluded scope (auth/payments/secrets/migrations/spend)");
    return {
      ok: false,
      reason: `PR is high-risk (${reasons.join(", ")}) — escalated to Coach regardless of trust tier.`,
      tier: input.tier,
      riskClass: input.riskClass,
    };
  }

  // L1 → never auto-merge
  if (input.tier === "L1") {
    return {
      ok: false,
      reason: "Repo is at L1 (report-only) — auto-merge is not allowed. The PR waits for a human to merge manually.",
      tier: input.tier,
      riskClass: input.riskClass,
    };
  }

  // L2 → auto-merge only low-risk
  if (input.tier === "L2") {
    if (input.riskClass === "low") {
      return {
        ok: true,
        reason: "Repo is at L2 (patch-only) and PR is low-risk — auto-merge allowed.",
        tier: input.tier,
        riskClass: input.riskClass,
      };
    }
    return {
      ok: false,
      reason: `Repo is at L2 (patch-only) but PR is ${input.riskClass}-risk — escalated to Coach for manual review.`,
      tier: input.tier,
      riskClass: input.riskClass,
    };
  }

  // L3 → auto-merge low and medium risk
  if (input.tier === "L3") {
    if (input.riskClass === "low" || input.riskClass === "medium") {
      return {
        ok: true,
        reason: `Repo is at L3 (auto-merge) and PR is ${input.riskClass}-risk — auto-merge allowed.`,
        tier: input.tier,
        riskClass: input.riskClass,
      };
    }
    return {
      ok: false,
      reason: `Repo is at L3 (auto-merge) but PR is ${input.riskClass}-risk — escalated to Coach.`,
      tier: input.tier,
      riskClass: input.riskClass,
    };
  }

  return {
    ok: false,
    reason: `Unknown trust tier: ${input.tier}`,
    tier: input.tier,
    riskClass: input.riskClass,
  };
}
