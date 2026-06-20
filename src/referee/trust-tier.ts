/**
 * Trust-tier configuration + transition logging (M3-2).
 *
 * Foreman ships at L1 (report-only). Moving to L2 (patch-only) or L3
 * (unattended auto-merge) is a manual opt-in via the DEFAULT_TRUST_TIER
 * env var — the loop never promotes itself.
 */

import { config } from "../config.js";
import type { TrustTier } from "./trust-gate.js";

let lastLoggedTier: TrustTier | null = null;

/** Return the manually configured trust tier. Defaults to L1. */
export function getConfiguredTrustTier(): TrustTier {
  return config.defaultTrustTier;
}

/**
 * Log the trust tier. Emits a transition line whenever the configured
 * tier changes between calls, so operators can audit ladder movement.
 */
export function logTrustTier(log: (m: string) => void): TrustTier {
  const tier = getConfiguredTrustTier();
  if (lastLoggedTier !== null && lastLoggedTier !== tier) {
    log(`trust tier transitioned: ${lastLoggedTier} -> ${tier} (manual opt-in via DEFAULT_TRUST_TIER)`);
  }
  lastLoggedTier = tier;
  return tier;
}

/** Reset the transition tracker (useful in tests). */
export function resetTrustTierLog(): void {
  lastLoggedTier = null;
}
