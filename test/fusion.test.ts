import { describe, it, expect } from "vitest";
import { scoreCandidate, judgePanel, createFusionDriver, type Candidate } from "../src/drivers/fusion.js";
import type { FighterDriver, FighterDriverDeps } from "../src/drivers/fighter.js";

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

describe("scoreCandidate", () => {
  it("scores a fully passing candidate higher", () => {
    const c = makeCandidate({ fighterName: "a" });
    const score = scoreCandidate(c, 1000);
    expect(score).toBe(100 + 50 + 10 + 10); // tests + build + no-errors + test-count
  });

  it("scores a failing candidate lower", () => {
    const c = makeCandidate({
      fighterName: "b",
      testResults: { passed: false, testsRun: 10, testsPassed: 5, buildOk: true, errors: ["err"] },
    });
    const score = scoreCandidate(c, 1000);
    expect(score).toBe(50 + 5); // build + test-count, no +100, no +10
  });

  it("gives speed bonus to faster candidates", () => {
    const fast = makeCandidate({ fighterName: "fast", metadata: { rounds: 1, timeMs: 500 } });
    const slow = makeCandidate({ fighterName: "slow", metadata: { rounds: 1, timeMs: 2000 } });
    const fastScore = scoreCandidate(fast, 2000);
    const slowScore = scoreCandidate(slow, 2000);
    expect(fastScore).toBeGreaterThan(slowScore);
  });
});

describe("judgePanel", () => {
  it("selects the highest-scoring candidate as winner", () => {
    const candidates = [
      makeCandidate({ fighterName: "a", testResults: { passed: false, testsRun: 10, testsPassed: 5, buildOk: true, errors: ["e"] } }),
      makeCandidate({ fighterName: "b" }), // fully passing
    ];
    const verdict = judgePanel(candidates);
    expect(verdict.winner).not.toBeNull();
    expect(verdict.winner!.fighterName).toBe("b");
  });

  it("returns null winner when all candidates fail tests", () => {
    const candidates = [
      makeCandidate({ fighterName: "a", testResults: { passed: false, testsRun: 10, testsPassed: 3, buildOk: true, errors: ["e"] } }),
      makeCandidate({ fighterName: "b", testResults: { passed: false, testsRun: 10, testsPassed: 5, buildOk: true, errors: ["e"] } }),
    ];
    const verdict = judgePanel(candidates);
    expect(verdict.winner).toBeNull();
    expect(verdict.winnerIndex).toBe(-1);
    expect(verdict.consensus).toContain("No winner");
  });

  it("breaks ties by speed (faster wins)", () => {
    const candidates = [
      makeCandidate({ fighterName: "slow", metadata: { rounds: 1, timeMs: 3000 } }),
      makeCandidate({ fighterName: "fast", metadata: { rounds: 1, timeMs: 1000 } }),
    ];
    const verdict = judgePanel(candidates);
    expect(verdict.winner!.fighterName).toBe("fast");
  });

  it("ranks all candidates", () => {
    const candidates = [
      makeCandidate({ fighterName: "a", testResults: { passed: false, testsRun: 10, testsPassed: 3, buildOk: false, errors: ["e"] } }),
      makeCandidate({ fighterName: "b" }),
      makeCandidate({ fighterName: "c", testResults: { passed: true, testsRun: 10, testsPassed: 8, buildOk: true, errors: [] } }),
    ];
    const verdict = judgePanel(candidates);
    expect(verdict.ranking).toHaveLength(3);
    expect(verdict.ranking[0].candidate.fighterName).toBe("b"); // fully passing
  });

  it("handles empty panel", () => {
    const verdict = judgePanel([]);
    expect(verdict.winner).toBeNull();
    expect(verdict.winnerIndex).toBe(-1);
    expect(verdict.ranking).toEqual([]);
  });

  it("includes a human-readable consensus", () => {
    const candidates = [makeCandidate({ fighterName: "winner" })];
    const verdict = judgePanel(candidates);
    expect(verdict.consensus).toContain("winner");
    expect(verdict.consensus).toContain("score");
  });
});

describe("createFusionDriver", () => {
  it("creates a driver with a composite name", () => {
    const fighters: FighterDriver[] = [
      { name: "ollama", async tick() {} },
      { name: "kimi", async tick() {} },
    ];
    const deps: FighterDriverDeps = {
      store: {} as any,
      auth: (async () => ({} as any)) as any,
      log: () => {},
    };
    const driver = createFusionDriver(fighters, deps);
    expect(driver.name).toBe("fusion(ollama,kimi)");
  });

  it("ticks all panel members in parallel", async () => {
    let tickCount = 0;
    const fighters: FighterDriver[] = [
      { name: "a", async tick() { tickCount++; } },
      { name: "b", async tick() { tickCount++; } },
      { name: "c", async tick() { tickCount++; } },
    ];
    const deps: FighterDriverDeps = {
      store: {} as any,
      auth: (async () => ({} as any)) as any,
      log: () => {},
    };
    const driver = createFusionDriver(fighters, deps);
    await driver.tick();
    expect(tickCount).toBe(3);
  });

  it("satisfies the FighterDriver socket", () => {
    const fighters: FighterDriver[] = [{ name: "solo", async tick() {} }];
    const deps: FighterDriverDeps = {
      store: {} as any,
      auth: (async () => ({} as any)) as any,
      log: () => {},
    };
    const driver = createFusionDriver(fighters, deps);
    // The FusionDriver IS a FighterDriver — the loop can't tell the difference
    expect(driver.name).toBeDefined();
    expect(typeof driver.tick).toBe("function");
  });
});
