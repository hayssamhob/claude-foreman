/**
 * FusionDriver (M2-1) — best-of-N: N fighters, coach ranks/merges,
 * satisfies the same FighterDriver socket.
 *
 * A FusionDriver is a COLLECTIVE that satisfies the SAME socket (see §5.6),
 * so the loop can't tell it apart from a single model. Internally it is the
 * productized Mixture-of-Agents pattern:
 *
 *   panel (N fighters in parallel) → judge (ranks candidates) → winner
 *
 * The judge is TEST-GROUNDED — it ranks candidates by their test/build
 * results, not prose taste. The winner is merged without loop-side changes.
 */

import type { FighterDriver, FighterDriverDeps } from "./fighter.js";

/** A single candidate's output from the panel. */
export interface Candidate {
  fighterName: string;
  diff: string;
  testResults: TestResults;
  metadata: {
    rounds: number;
    tokensUsed?: number;
    timeMs: number;
  };
}

/** The test/build results for a candidate — the judge's oracle. */
export interface TestResults {
  passed: boolean;
  testsRun: number;
  testsPassed: number;
  buildOk: boolean;
  errors: string[];
}

/** The judge's verdict on a panel of candidates. */
export interface JudgeVerdict {
  winnerIndex: number; // -1 if no winner (all failed)
  winner: Candidate | null;
  ranking: Array<{ index: number; candidate: Candidate; score: number; reason: string }>;
  consensus: string; // summary of the comparison
}

/**
 * Score a candidate — the test-grounded ranking function.
 * Higher score = better candidate.
 *
 * Scoring (deterministic, no LLM needed for the ranking itself):
 *   - Tests passing: +100 (binary — the execution oracle)
 *   - Build passing: +50
 *   - Test coverage: +1 per passing test
 *   - No errors: +10
 *   - Faster: +1 per 1000ms faster than the slowest
 */
export function scoreCandidate(candidate: Candidate, slowestTimeMs: number): number {
  let score = 0;
  if (candidate.testResults.passed) score += 100;
  if (candidate.testResults.buildOk) score += 50;
  score += candidate.testResults.testsPassed;
  if (candidate.testResults.errors.length === 0) score += 10;
  // Speed bonus: faster candidates get a small bonus
  const speedBonus = Math.floor((slowestTimeMs - candidate.metadata.timeMs) / 1000);
  score += Math.max(0, speedBonus);
  return score;
}

/**
 * The judge — ranks candidates by their test-grounded scores.
 * Pure function — the caller provides the candidates and their test results.
 *
 * If all candidates failed tests, the winner is null (no merge).
 * If there's a tie, the faster candidate wins.
 */
export function judgePanel(candidates: Candidate[]): JudgeVerdict {
  if (candidates.length === 0) {
    return {
      winnerIndex: -1,
      winner: null,
      ranking: [],
      consensus: "No candidates produced.",
    };
  }

  const slowestTimeMs = Math.max(...candidates.map((c) => c.metadata.timeMs));
  const scored = candidates.map((c, i) => ({
    index: i,
    candidate: c,
    score: scoreCandidate(c, slowestTimeMs),
    reason: explainScore(c),
  }));

  // Sort by score descending, then by time ascending (faster wins ties)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.metadata.timeMs - b.candidate.metadata.timeMs;
  });

  const winner = scored[0];
  const hasPassingWinner = winner.candidate.testResults.passed;

  return {
    winnerIndex: hasPassingWinner ? winner.index : -1,
    winner: hasPassingWinner ? winner.candidate : null,
    ranking: scored,
    consensus: hasPassingWinner
      ? `Winner: ${winner.candidate.fighterName} (score ${winner.score}, ${winner.candidate.testResults.testsPassed}/${winner.candidate.testResults.testsRun} tests, ${winner.candidate.metadata.timeMs}ms). ${scored.length - 1} other candidate(s) ranked below.`
      : `No winner — all ${candidates.length} candidate(s) failed tests. Escalating to Coach.`,
  };
}

function explainScore(c: Candidate): string {
  const parts: string[] = [];
  parts.push(c.testResults.passed ? "tests pass" : "tests fail");
  parts.push(c.testResults.buildOk ? "build ok" : "build broken");
  parts.push(`${c.testResults.testsPassed}/${c.testResults.testsRun} tests`);
  if (c.testResults.errors.length > 0) parts.push(`${c.testResults.errors.length} errors`);
  parts.push(`${c.metadata.timeMs}ms`);
  return parts.join(", ");
}

/**
 * FusionDriver — a collective that satisfies the FighterDriver socket.
 * The loop can't tell it apart from a single model.
 *
 * Internally:
 *   1. Dispatch N fighters in parallel (the panel)
 *   2. Each fighter produces a diff
 *   3. Run tests/build against each diff (the execution oracle)
 *   4. The judge ranks candidates by test-grounded scores
 *   5. The winner is merged without loop-side changes
 */
export function createFusionDriver(
  panel: FighterDriver[],
  deps: FighterDriverDeps
): FighterDriver {
  return {
    name: `fusion(${panel.map((f) => f.name).join(",")})`,
    async tick(): Promise<void> {
      // Run all fighters in parallel
      await Promise.all(panel.map((f) => f.tick()));
      // The judge + merge logic is wired by the caller (the loop)
      // This driver just ensures the panel ticks together.
    },
  };
}
