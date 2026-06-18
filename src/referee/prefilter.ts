import type { CiState } from "../threads.js";

export interface PreFilterPass {
  proceed: true;
}

export interface PreFilterBounce {
  proceed: false;
  reason: string;
  detail: string;
}

export type PreFilterResult = PreFilterPass | PreFilterBounce;

/**
 * Pre-filter: do not spend coach tokens reviewing a PR whose own automated
 * checks are already failing. Pending/green/no-CI work proceeds normally.
 */
export function preFilterReview(ci: CiState): PreFilterResult {
  if (ci.overall === "red") {
    return {
      proceed: false,
      reason: "automated checks are failing",
      detail: ci.detail,
    };
  }
  return { proceed: true };
}
