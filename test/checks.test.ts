import { describe, it, expect } from "vitest";
import {
  doneContractCheck,
  coachVerdictCheck,
  readinessCheck,
  costCheck,
  stallCheck,
  buildAllChecks,
  allGatingPass,
  SIGNAL_ROLES,
} from "../src/referee/checks.js";

describe("doneContractCheck", () => {
  it("passes when tests and AC both pass", () => {
    const c = doneContractCheck({ testsPass: true, acceptanceCriteriaMet: true });
    expect(c.conclusion).toBe("success");
    expect(c.role).toBe("gating");
  });

  it("fails when tests fail", () => {
    const c = doneContractCheck({ testsPass: false, acceptanceCriteriaMet: true });
    expect(c.conclusion).toBe("failure");
  });

  it("fails when AC not met", () => {
    const c = doneContractCheck({ testsPass: true, acceptanceCriteriaMet: false });
    expect(c.conclusion).toBe("failure");
  });

  it("includes test count in summary", () => {
    const c = doneContractCheck({ testsPass: true, acceptanceCriteriaMet: true, testCount: 42 });
    expect(c.summary).toContain("42");
  });
});

describe("coachVerdictCheck", () => {
  it("passes on approve", () => {
    const c = coachVerdictCheck({ verdict: "approve" });
    expect(c.conclusion).toBe("success");
    expect(c.role).toBe("gating");
  });

  it("fails on request-changes", () => {
    const c = coachVerdictCheck({ verdict: "request-changes" });
    expect(c.conclusion).toBe("failure");
  });

  it("is action_required on pending", () => {
    const c = coachVerdictCheck({ verdict: "pending" });
    expect(c.conclusion).toBe("action_required");
  });

  it("includes reasons in summary", () => {
    const c = coachVerdictCheck({ verdict: "request-changes", reasons: "Missing tests" });
    expect(c.summary).toContain("Missing tests");
  });
});

describe("readinessCheck", () => {
  it("passes at L2", () => {
    const c = readinessCheck({ tier: "L2" });
    expect(c.conclusion).toBe("success");
    expect(c.role).toBe("gating");
  });

  it("passes at L3", () => {
    const c = readinessCheck({ tier: "L3" });
    expect(c.conclusion).toBe("success");
  });

  it("fails at L1", () => {
    const c = readinessCheck({ tier: "L1" });
    expect(c.conclusion).toBe("failure");
    expect(c.title).toContain("report-only");
  });

  it("includes blockers in summary", () => {
    const c = readinessCheck({ tier: "L1", blockers: ["No tests", "No CI"] });
    expect(c.summary).toContain("No tests");
    expect(c.summary).toContain("No CI");
  });
});

describe("costCheck", () => {
  it("is always neutral (informational)", () => {
    const c = costCheck({ spentUsd: 0.5, budgetUsd: 1.0 });
    expect(c.conclusion).toBe("neutral");
    expect(c.role).toBe("informational");
  });

  it("flags over-budget in title", () => {
    const c = costCheck({ spentUsd: 2.0, budgetUsd: 1.0 });
    expect(c.title).toContain("Over budget");
  });

  it("includes spend and budget in summary", () => {
    const c = costCheck({ spentUsd: 0.5, budgetUsd: 1.0, tokensUsed: 5000 });
    expect(c.summary).toContain("$0.50");
    expect(c.summary).toContain("$1.00");
    expect(c.summary).toContain("5000");
  });
});

describe("stallCheck", () => {
  it("is always neutral (informational)", () => {
    const c = stallCheck({ stalled: true });
    expect(c.conclusion).toBe("neutral");
    expect(c.role).toBe("informational");
  });

  it("reports stall with rounds and reason", () => {
    const c = stallCheck({ stalled: true, rounds: 3, reason: "no diff produced" });
    expect(c.title).toContain("3 rounds");
    expect(c.summary).toContain("no diff produced");
  });

  it("reports no stall", () => {
    const c = stallCheck({ stalled: false });
    expect(c.title).toContain("No stall");
  });
});

describe("buildAllChecks", () => {
  it("builds all 5 signal checks", () => {
    const checks = buildAllChecks({
      testsPass: true, acceptanceCriteriaMet: true,
      verdict: "approve", tier: "L3",
      stalled: false,
    });
    expect(checks).toHaveLength(5);
    expect(checks.map((c) => c.signal)).toEqual([
      "foreman/done-contract",
      "foreman/coach-verdict",
      "foreman/readiness",
      "foreman/cost",
      "foreman/stall",
    ]);
  });

  it("all gating pass when everything is green", () => {
    const checks = buildAllChecks({
      testsPass: true, acceptanceCriteriaMet: true,
      verdict: "approve", tier: "L3",
      stalled: false,
    });
    expect(allGatingPass(checks)).toBe(true);
  });

  it("gating fails when tests fail", () => {
    const checks = buildAllChecks({
      testsPass: false, acceptanceCriteriaMet: true,
      verdict: "approve", tier: "L3",
      stalled: false,
    });
    expect(allGatingPass(checks)).toBe(false);
  });

  it("gating fails when coach requests changes", () => {
    const checks = buildAllChecks({
      testsPass: true, acceptanceCriteriaMet: true,
      verdict: "request-changes", tier: "L3",
      stalled: false,
    });
    expect(allGatingPass(checks)).toBe(false);
  });

  it("gating fails at L1", () => {
    const checks = buildAllChecks({
      testsPass: true, acceptanceCriteriaMet: true,
      verdict: "approve", tier: "L1",
      stalled: false,
    });
    expect(allGatingPass(checks)).toBe(false);
  });

  it("informational checks don't affect allGatingPass", () => {
    const checks = buildAllChecks({
      testsPass: true, acceptanceCriteriaMet: true,
      verdict: "approve", tier: "L3",
      stalled: true, spentUsd: 999, budgetUsd: 1,
    });
    // Stall and cost are informational — they don't block
    expect(allGatingPass(checks)).toBe(true);
  });
});

describe("SIGNAL_ROLES", () => {
  it("done-contract is gating", () => {
    expect(SIGNAL_ROLES["foreman/done-contract"]).toBe("gating");
  });
  it("coach-verdict is gating", () => {
    expect(SIGNAL_ROLES["foreman/coach-verdict"]).toBe("gating");
  });
  it("readiness is gating", () => {
    expect(SIGNAL_ROLES["foreman/readiness"]).toBe("gating");
  });
  it("cost is informational", () => {
    expect(SIGNAL_ROLES["foreman/cost"]).toBe("informational");
  });
  it("stall is informational", () => {
    expect(SIGNAL_ROLES["foreman/stall"]).toBe("informational");
  });
});
