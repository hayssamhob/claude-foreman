/**
 * Trust ladder enforcement (M3-2) — L1→L2→L3 tier transitions in the automerge seam.
 *
 * Each tier's permitted actions are enforced in code:
 *   L1 (report-only)  — no auto-merge, human merges everything
 *   L2 (patch-only)   — auto-merge low-risk patches only
 *   L3 (auto-merge)   — auto-merge low + medium risk; high-risk escalates
 *
 * Tier changes are manual opt-in (§6.3):
 *   - The owner sets the tier via a `trust:L1`, `trust:L2`, or `trust:L3` label
 *     on the repo's config issue or via the `foreman audit` CLI command.
 *   - Transitions are logged so the owner can audit the history.
 *   - The tier is stored in the SQLite cache and reconciled with GitHub labels.
 */

import type { Store } from "../state/db.js";
import type { TrustTier } from "./trust-gate.js";

/** A tier transition record for audit logging. */
export interface TierTransition {
  repo: string;
  from: TrustTier;
  to: TrustTier;
  reason: string;
  timestamp: number;
}

/** The permitted actions per tier. */
export const TIER_ACTIONS: Record<TrustTier, {
  autoMerge: boolean;
  autoMergeLowRisk: boolean;
  autoMergeMediumRisk: boolean;
  description: string;
}> = {
  L1: {
    autoMerge: false,
    autoMergeLowRisk: false,
    autoMergeMediumRisk: false,
    description: "report-only — human merges everything",
  },
  L2: {
    autoMerge: true,
    autoMergeLowRisk: true,
    autoMergeMediumRisk: false,
    description: "patch-only — auto-merge low-risk patches, human reviews the rest",
  },
  L3: {
    autoMerge: true,
    autoMergeLowRisk: true,
    autoMergeMediumRisk: true,
    description: "auto-merge — low + medium risk auto-merged, high-risk escalates",
  },
};

/**
 * Parse a trust tier from a label name.
 * Returns null if the label is not a trust tier label.
 */
export function parseTrustLabel(label: string): TrustTier | null {
  if (label === "trust:L1" || label === "trust:l1") return "L1";
  if (label === "trust:L2" || label === "trust:l2") return "L2";
  if (label === "trust:L3" || label === "trust:l3") return "L3";
  return null;
}

/**
 * Record a tier transition in the audit log.
 * This is the "transitions logged" requirement from the done-contract.
 */
export function logTierTransition(
  store: Store,
  transition: TierTransition
): void {
  // Use the handoff note as an audit log — it's already in the schema
  // and gets displayed on the dashboard.
  const note = `[trust] ${transition.repo}: ${transition.from} → ${transition.to} — ${transition.reason}`;
  store.saveHandoffNote(note, "trust-ladder");
}

/**
 * Resolve the current trust tier for a repo.
 *
 * Priority:
 *   1. Manual override via `trust:L1/L2/L3` label on the repo's config issue
 *   2. Computed ReadinessScore from `foreman audit` (stored in config)
 *   3. Default: L1 (safe default — no auto-merge)
 */
export function resolveTrustTier(
  labels: string[],
  computedTier?: TrustTier
): TrustTier {
  // Check for manual override labels
  for (const label of labels) {
    const tier = parseTrustLabel(label);
    if (tier) return tier;
  }
  // Fall back to computed tier
  if (computedTier) return computedTier;
  // Safe default
  return "L1";
}

/**
 * Check if a tier transition is valid.
 * Tier changes are manual opt-in — any transition is allowed, but
 * it must be logged.
 */
export function isValidTransition(from: TrustTier, to: TrustTier): boolean {
  // All transitions are valid — the owner can move freely between tiers.
  // The constraint is that transitions are LOGGED, not that they're restricted.
  return from === to || true; // always valid, always logged
}

/**
 * Enforce the tier's permitted actions for a given risk class.
 * This is the core enforcement function called by the automerge seam.
 */
export function enforceTierAction(
  tier: TrustTier,
  riskClass: "low" | "medium" | "high"
): { allowed: boolean; reason: string } {
  const actions = TIER_ACTIONS[tier];

  if (riskClass === "high") {
    return {
      allowed: false,
      reason: `PR is high-risk — always escalated to Coach regardless of tier (${tier}: ${actions.description})`,
    };
  }

  if (riskClass === "medium") {
    if (actions.autoMergeMediumRisk) {
      return { allowed: true, reason: `${tier} allows auto-merge of medium-risk PRs` };
    }
    return { allowed: false, reason: `${tier} does not allow auto-merge of medium-risk PRs — escalated to Coach` };
  }

  // low risk
  if (actions.autoMergeLowRisk) {
    return { allowed: true, reason: `${tier} allows auto-merge of low-risk PRs` };
  }
  return { allowed: false, reason: `${tier} does not allow auto-merge — human review required` };
}
