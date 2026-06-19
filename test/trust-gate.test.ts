import { describe, it, expect } from "vitest";
import { classifyRisk, trustGate, type RiskClass } from "../src/referee/trust-gate.js";

describe("classifyRisk", () => {
  it("classifies as high when touching banned paths", () => {
    expect(classifyRisk({ changedFileCount: 1, touchesBannedPath: true, isExcludedScope: false })).toBe("high");
  });

  it("classifies as high when in excluded scope", () => {
    expect(classifyRisk({ changedFileCount: 1, touchesBannedPath: false, isExcludedScope: true })).toBe("high");
  });

  it("classifies as medium for large file count", () => {
    expect(classifyRisk({ changedFileCount: 15, touchesBannedPath: false, isExcludedScope: false })).toBe("medium");
  });

  it("classifies as medium for large line count", () => {
    expect(classifyRisk({ changedFileCount: 3, touchesBannedPath: false, isExcludedScope: false, linesChanged: 600 })).toBe("medium");
  });

  it("classifies as low for small diffs", () => {
    expect(classifyRisk({ changedFileCount: 2, touchesBannedPath: false, isExcludedScope: false, linesChanged: 50 })).toBe("low");
  });

  it("classifies as low at the boundary (10 files)", () => {
    expect(classifyRisk({ changedFileCount: 10, touchesBannedPath: false, isExcludedScope: false })).toBe("low");
  });

  it("classifies as medium just above the boundary (11 files)", () => {
    expect(classifyRisk({ changedFileCount: 11, touchesBannedPath: false, isExcludedScope: false })).toBe("medium");
  });
});

describe("trustGate", () => {
  it("refuses auto-merge at L1 regardless of risk", () => {
    const result = trustGate({ tier: "L1", riskClass: "low", changedFileCount: 1, touchesBannedPath: false, isExcludedScope: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("L1");
  });

  it("allows auto-merge at L2 for low-risk PRs", () => {
    const result = trustGate({ tier: "L2", riskClass: "low", changedFileCount: 2, touchesBannedPath: false, isExcludedScope: false });
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("L2");
  });

  it("refuses auto-merge at L2 for medium-risk PRs", () => {
    const result = trustGate({ tier: "L2", riskClass: "medium", changedFileCount: 15, touchesBannedPath: false, isExcludedScope: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("L2");
    expect(result.reason).toContain("medium");
  });

  it("allows auto-merge at L3 for low-risk PRs", () => {
    const result = trustGate({ tier: "L3", riskClass: "low", changedFileCount: 1, touchesBannedPath: false, isExcludedScope: false });
    expect(result.ok).toBe(true);
  });

  it("allows auto-merge at L3 for medium-risk PRs", () => {
    const result = trustGate({ tier: "L3", riskClass: "medium", changedFileCount: 15, touchesBannedPath: false, isExcludedScope: false });
    expect(result.ok).toBe(true);
  });

  it("refuses auto-merge for high-risk PRs regardless of tier", () => {
    for (const tier of ["L1", "L2", "L3"] as const) {
      const result = trustGate({ tier, riskClass: "high", changedFileCount: 1, touchesBannedPath: true, isExcludedScope: false });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("high-risk");
    }
  });

  it("refuses auto-merge for excluded scope regardless of tier", () => {
    const result = trustGate({ tier: "L3", riskClass: "high", changedFileCount: 1, touchesBannedPath: false, isExcludedScope: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("excluded scope");
  });

  it("includes tier and risk class in the result", () => {
    const result = trustGate({ tier: "L2", riskClass: "low", changedFileCount: 1, touchesBannedPath: false, isExcludedScope: false });
    expect(result.tier).toBe("L2");
    expect(result.riskClass).toBe("low");
  });
});
