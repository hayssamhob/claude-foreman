import type { ReviewResult } from "../manager/worker.js";

export type JobOutcome =
  | { action: "approve" }
  | { action: "request_changes"; points: string[] }
  | { action: "fail"; reason: string };

/**
 * Pure router: maps a ReviewResult to a JobOutcome.
 * No side-effects — all branching logic lives here so it can be unit-tested
 * without wiring up Octokit, the DB, or the manager CLI.
 */
export function routeOutcome(result: ReviewResult): JobOutcome {
  if (!result || typeof result !== "object") {
    return { action: "fail", reason: "Invalid or null review result" };
  }
  if (result.verdict === "approve") return { action: "approve" };
  if (result.verdict === "request_changes") {
    return { action: "request_changes", points: result.points ?? [] };
  }
  return { action: "fail", reason: result.summary ?? "unknown" };
}
