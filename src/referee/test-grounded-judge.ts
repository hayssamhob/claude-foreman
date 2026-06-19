/**
 * Test-grounded judge (M2-2).
 *
 * Feeds review context (CI state, threads, changed files) from
 * src/threads.ts into the fusion ranking. The judge is TEST-GROUNDED —
 * it ranks candidates by their execution oracle (tests, build, CI),
 * not prose taste.
 *
 * This extends the base `scoreCandidate()` / `judgePanel()` from
 * src/drivers/fusion.ts with richer review context:
 *   - CI state (green/red/pending/none)
 *   - Unresolved review threads
 *   - Changed files (for overlap/exclusion detection)
 *   - Branch state (behind main, staleness)
 */

import type { Candidate, JudgeVerdict } from "../drivers/fusion.js";
import { judgePanel, scoreCandidate } from "../drivers/fusion.js";

/** Review context from src/threads.ts — the execution oracle's signals. */
export interface ReviewContext {
  ciState: "green" | "red" | "pending" | "none";
  ciDetail: string;
  unresolvedThreads: number;
  resolvedThreads: number;
  changedFiles: string[];
  behindMain: number | null;
  touchesBannedPath: boolean;
}

/** A candidate enriched with review context. */
export interface ReviewedCandidate {
  candidate: Candidate;
  context: ReviewContext;
}

/**
 * Score a candidate with review context — the test-grounded ranking.
 *
 * Base score from scoreCandidate() (tests + build + speed) plus:
 *   - CI green: +30
 *   - CI red: -50 (hard penalty — CI is the execution oracle)
 *   - CI pending: 0 (wait for it)
 *   - No unresolved threads: +20
 *   - Each unresolved thread: -10
 *   - Not behind main: +10
 *   - Behind main: -5 per commit behind
 *   - Touches banned path: -100 (hard floor — never auto-merge)
 */
export function scoreWithReview(candidate: Candidate, context: ReviewContext, slowestTimeMs: number): number {
  let score = scoreCandidate(candidate, slowestTimeMs);

  // CI state — the execution oracle's verdict
  if (context.ciState === "green") score += 30;
  else if (context.ciState === "red") score -= 50;
  // pending: no bonus, no penalty — wait

  // Unresolved review threads
  if (context.unresolvedThreads === 0) score += 20;
  else score -= context.unresolvedThreads * 10;

  // Branch state
  if (context.behindMain !== null) {
    if (context.behindMain === 0) score += 10;
    else score -= context.behindMain * 5;
  }

  // Banned path — hard floor
  if (context.touchesBannedPath) score -= 100;

  return score;
}

/**
 * The test-grounded judge — ranks reviewed candidates by their
 * execution oracle + review context.
 *
 * If all candidates have CI red or touch banned paths, no winner.
 * The winner must have:
 *   - Tests passing (from the base Candidate)
 *   - CI green (from the ReviewContext)
 *   - No banned paths touched
 */
export function testGroundedJudge(reviewed: ReviewedCandidate[]): JudgeVerdict & {
  reviewedRanking: Array<{ index: number; candidate: Candidate; context: ReviewContext; score: number; reason: string }>;
} {
  if (reviewed.length === 0) {
    return {
      winnerIndex: -1,
      winner: null,
      ranking: [],
      consensus: "No candidates produced.",
      reviewedRanking: [],
    };
  }

  const slowestTimeMs = Math.max(...reviewed.map((r) => r.candidate.metadata.timeMs));
  const scored = reviewed.map((r, i) => {
    const score = scoreWithReview(r.candidate, r.context, slowestTimeMs);
    return {
      index: i,
      candidate: r.candidate,
      context: r.context,
      score,
      reason: explainReviewedScore(r.candidate, r.context),
    };
  });

  // Sort by score descending, then by time ascending
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.metadata.timeMs - b.candidate.metadata.timeMs;
  });

  const top = scored[0];
  // Winner must have: tests pass AND CI green AND no banned paths
  const hasValidWinner =
    top.candidate.testResults.passed &&
    top.context.ciState === "green" &&
    !top.context.touchesBannedPath;

  return {
    winnerIndex: hasValidWinner ? top.index : -1,
    winner: hasValidWinner ? top.candidate : null,
    ranking: scored.map((s) => ({
      index: s.index,
      candidate: s.candidate,
      score: s.score,
      reason: s.reason,
    })),
    consensus: hasValidWinner
      ? `Winner: ${top.candidate.fighterName} (score ${top.score}, CI ${top.context.ciState}, ${top.context.unresolvedThreads} unresolved threads, ${top.candidate.testResults.testsPassed}/${top.candidate.testResults.testsRun} tests).`
      : `No winner — top candidate ${top.candidate.fighterName} failed validation (CI: ${top.context.ciState}, tests: ${top.candidate.testResults.passed ? "pass" : "fail"}, banned: ${top.context.touchesBannedPath}). Escalating to Coach.`,
    reviewedRanking: scored,
  };
}

function explainReviewedScore(c: Candidate, ctx: ReviewContext): string {
  const parts: string[] = [];
  parts.push(c.testResults.passed ? "tests pass" : "tests fail");
  parts.push(`CI: ${ctx.ciState}`);
  parts.push(`${ctx.unresolvedThreads} unresolved threads`);
  if (ctx.behindMain !== null) parts.push(`${ctx.behindMain} behind main`);
  if (ctx.touchesBannedPath) parts.push("BANNED PATH");
  parts.push(`${c.metadata.timeMs}ms`);
  return parts.join(", ");
}

/**
 * Build a ReviewContext from the raw signals.
 * Pure function — the caller provides the signals from threads.ts.
 */
export function buildReviewContext(opts: {
  ciState: "green" | "red" | "pending" | "none";
  ciDetail: string;
  unresolvedThreads: number;
  resolvedThreads: number;
  changedFiles: string[];
  behindMain: number | null;
  bannedPaths?: string[];
}): ReviewContext {
  const touchesBannedPath = opts.bannedPaths
    ? opts.changedFiles.some((f) => opts.bannedPaths!.some((p) => f.includes(p)))
    : false;
  return {
    ciState: opts.ciState,
    ciDetail: opts.ciDetail,
    unresolvedThreads: opts.unresolvedThreads,
    resolvedThreads: opts.resolvedThreads,
    changedFiles: opts.changedFiles,
    behindMain: opts.behindMain,
    touchesBannedPath,
  };
}
