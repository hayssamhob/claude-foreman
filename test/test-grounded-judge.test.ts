import { describe, it, expect } from "vitest";
import {
  scoreWithReview,
  testGroundedJudge,
  buildReviewContext,
  type ReviewContext,
  type ReviewedCandidate,
} from "../src/referee/test-grounded-judge.js";
import type { Candidate } from "../src/drivers/fusion.js";

function makeCandidate(opts: Partial<Candidate> & { fighterName: string }): Candidate {
  return {
    fighterName: opts.fighterName,
    diff: opts.diff ?? "",
    testResults: opts.testResults ?? {
      passed: true, testsRun: 10, testsPassed: 10, buildOk: true, errors: [],
    },
    metadata: opts.metadata ?? { rounds: 1, timeMs: 1000 },
  };
}

function makeContext(opts: Partial<ReviewContext> = {}): ReviewContext {
  return {
    ciState: opts.ciState ?? "green",
    ciDetail: opts.ciDetail ?? "5 checks passed",
    unresolvedThreads: opts.unresolvedThreads ?? 0,
    resolvedThreads: opts.resolvedThreads ?? 0,
    changedFiles: opts.changedFiles ?? ["src/foo.ts"],
    behindMain: opts.behindMain ?? 0,
    touchesBannedPath: opts.touchesBannedPath ?? false,
  };
}

function makeReviewed(opts: Partial<ReviewedCandidate> & { fighterName: string }): ReviewedCandidate {
  return {
    candidate: opts.candidate ?? makeCandidate({ fighterName: opts.fighterName }),
    context: opts.context ?? makeContext(),
  };
}

describe("scoreWithReview", () => {
  it("gives bonus for CI green", () => {
    const c = makeCandidate({ fighterName: "a" });
    const greenScore = scoreWithReview(c, makeContext({ ciState: "green" }), 1000);
    const redScore = scoreWithReview(c, makeContext({ ciState: "red" }), 1000);
    expect(greenScore).toBeGreaterThan(redScore);
  });

  it("penalizes CI red heavily", () => {
    const c = makeCandidate({ fighterName: "a" });
    const score = scoreWithReview(c, makeContext({ ciState: "red" }), 1000);
    const baseScore = scoreWithReview(c, makeContext({ ciState: "none" }), 1000);
    expect(score).toBeLessThan(baseScore);
  });

  it("gives bonus for no unresolved threads", () => {
    const c = makeCandidate({ fighterName: "a" });
    const cleanScore = scoreWithReview(c, makeContext({ unresolvedThreads: 0 }), 1000);
    const dirtyScore = scoreWithReview(c, makeContext({ unresolvedThreads: 3 }), 1000);
    expect(cleanScore).toBeGreaterThan(dirtyScore);
  });

  it("penalizes each unresolved thread", () => {
    const c = makeCandidate({ fighterName: "a" });
    const oneThread = scoreWithReview(c, makeContext({ unresolvedThreads: 1 }), 1000);
    const threeThreads = scoreWithReview(c, makeContext({ unresolvedThreads: 3 }), 1000);
    expect(oneThread).toBeGreaterThan(threeThreads);
  });

  it("gives bonus for not being behind main", () => {
    const c = makeCandidate({ fighterName: "a" });
    const fresh = scoreWithReview(c, makeContext({ behindMain: 0 }), 1000);
    const stale = scoreWithReview(c, makeContext({ behindMain: 5 }), 1000);
    expect(fresh).toBeGreaterThan(stale);
  });

  it("hard-penalizes banned paths", () => {
    const c = makeCandidate({ fighterName: "a" });
    const safe = scoreWithReview(c, makeContext({ touchesBannedPath: false }), 1000);
    const banned = scoreWithReview(c, makeContext({ touchesBannedPath: true }), 1000);
    expect(banned).toBeLessThan(safe);
    expect(safe - banned).toBeGreaterThanOrEqual(100); // 100-point penalty
  });
});

describe("testGroundedJudge", () => {
  it("selects the candidate with CI green + tests pass as winner", () => {
    const reviewed = [
      makeReviewed({ fighterName: "a", context: makeContext({ ciState: "red" }) }),
      makeReviewed({ fighterName: "b", context: makeContext({ ciState: "green" }) }),
    ];
    const verdict = testGroundedJudge(reviewed);
    expect(verdict.winner).not.toBeNull();
    expect(verdict.winner!.fighterName).toBe("b");
  });

  it("returns null winner when all candidates have CI red", () => {
    const reviewed = [
      makeReviewed({ fighterName: "a", context: makeContext({ ciState: "red" }) }),
      makeReviewed({ fighterName: "b", context: makeContext({ ciState: "red" }) }),
    ];
    const verdict = testGroundedJudge(reviewed);
    expect(verdict.winner).toBeNull();
    expect(verdict.winnerIndex).toBe(-1);
    expect(verdict.consensus).toContain("No winner");
  });

  it("returns null winner when top candidate touches banned path", () => {
    const reviewed = [
      makeReviewed({ fighterName: "a", context: makeContext({ touchesBannedPath: true }) }),
      makeReviewed({ fighterName: "b", context: makeContext({ ciState: "red" }) }),
    ];
    const verdict = testGroundedJudge(reviewed);
    expect(verdict.winner).toBeNull();
  });

  it("returns null winner when top candidate has failing tests", () => {
    const reviewed = [
      makeReviewed({
        fighterName: "a",
        candidate: makeCandidate({
          fighterName: "a",
          testResults: { passed: false, testsRun: 10, testsPassed: 3, buildOk: true, errors: ["e"] },
        }),
        context: makeContext({ ciState: "green" }),
      }),
      makeReviewed({ fighterName: "b", context: makeContext({ ciState: "red" }) }),
    ];
    const verdict = testGroundedJudge(reviewed);
    expect(verdict.winner).toBeNull();
  });

  it("ranks all candidates with review context", () => {
    const reviewed = [
      makeReviewed({ fighterName: "a", context: makeContext({ ciState: "red", unresolvedThreads: 2 }) }),
      makeReviewed({ fighterName: "b", context: makeContext({ ciState: "green", unresolvedThreads: 0 }) }),
      makeReviewed({ fighterName: "c", context: makeContext({ ciState: "green", unresolvedThreads: 1 }) }),
    ];
    const verdict = testGroundedJudge(reviewed);
    expect(verdict.reviewedRanking).toHaveLength(3);
    expect(verdict.reviewedRanking[0].candidate.fighterName).toBe("b");
  });

  it("includes review context in the consensus", () => {
    const reviewed = [makeReviewed({ fighterName: "winner" })];
    const verdict = testGroundedJudge(reviewed);
    expect(verdict.consensus).toContain("CI");
    expect(verdict.consensus).toContain("threads");
  });

  it("handles empty panel", () => {
    const verdict = testGroundedJudge([]);
    expect(verdict.winner).toBeNull();
    expect(verdict.reviewedRanking).toEqual([]);
  });

  it("breaks ties by speed", () => {
    const reviewed = [
      makeReviewed({ fighterName: "slow", candidate: makeCandidate({ fighterName: "slow", metadata: { rounds: 1, timeMs: 3000 } }) }),
      makeReviewed({ fighterName: "fast", candidate: makeCandidate({ fighterName: "fast", metadata: { rounds: 1, timeMs: 1000 } }) }),
    ];
    const verdict = testGroundedJudge(reviewed);
    expect(verdict.winner!.fighterName).toBe("fast");
  });
});

describe("buildReviewContext", () => {
  it("builds context from raw signals", () => {
    const ctx = buildReviewContext({
      ciState: "green",
      ciDetail: "5 checks passed",
      unresolvedThreads: 2,
      resolvedThreads: 3,
      changedFiles: ["src/foo.ts", "src/bar.ts"],
      behindMain: 0,
    });
    expect(ctx.ciState).toBe("green");
    expect(ctx.unresolvedThreads).toBe(2);
    expect(ctx.changedFiles).toHaveLength(2);
    expect(ctx.touchesBannedPath).toBe(false);
  });

  it("detects banned paths from changed files", () => {
    const ctx = buildReviewContext({
      ciState: "green",
      ciDetail: "ok",
      unresolvedThreads: 0,
      resolvedThreads: 0,
      changedFiles: ["src/auth/login.ts", "src/utils.ts"],
      behindMain: 0,
      bannedPaths: ["auth"],
    });
    expect(ctx.touchesBannedPath).toBe(true);
  });

  it("does not flag banned when no overlap", () => {
    const ctx = buildReviewContext({
      ciState: "green",
      ciDetail: "ok",
      unresolvedThreads: 0,
      resolvedThreads: 0,
      changedFiles: ["src/utils.ts", "test/foo.test.ts"],
      behindMain: 0,
      bannedPaths: ["auth", "payment"],
    });
    expect(ctx.touchesBannedPath).toBe(false);
  });
});
