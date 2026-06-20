import { describe, it, expect } from "vitest";
import { computeReadiness, formatReadinessReport, readReadiness, type RepoSignals } from "../src/referee/readiness.js";
import type { Octokit } from "../src/octokit.js";

const SIGNALS_NO_TESTS: RepoSignals = {
  hasTests: false, hasCI: false, hasBranchProtection: false,
  testCount: 0, ciWorkflows: [], requiredChecks: [], hasCodeowners: false,
};

const SIGNALS_TESTS_NO_CI: RepoSignals = {
  hasTests: true, hasCI: false, hasBranchProtection: false,
  testCount: 5, ciWorkflows: [], requiredChecks: [], hasCodeowners: false,
};

const SIGNALS_L2: RepoSignals = {
  hasTests: true, hasCI: true, hasBranchProtection: false,
  testCount: 10, ciWorkflows: ["build-test.yml"], requiredChecks: [], hasCodeowners: false,
};

const SIGNALS_L2_CODEOWNERS: RepoSignals = {
  hasTests: true, hasCI: true, hasBranchProtection: false,
  testCount: 10, ciWorkflows: ["build-test.yml"], requiredChecks: [], hasCodeowners: true,
};

const SIGNALS_L3: RepoSignals = {
  hasTests: true, hasCI: true, hasBranchProtection: true,
  testCount: 15, ciWorkflows: ["build-test.yml", "lint.yml"], requiredChecks: ["foreman/done-contract"], hasCodeowners: true,
};

const SIGNALS_L3_NO_REQUIRED: RepoSignals = {
  hasTests: true, hasCI: true, hasBranchProtection: true,
  testCount: 15, ciWorkflows: ["build-test.yml"], requiredChecks: [], hasCodeowners: true,
};

describe("computeReadiness", () => {
  it("floors at L1 when no tests", () => {
    const result = computeReadiness(SIGNALS_NO_TESTS);
    expect(result.tier).toBe("L1");
    expect(result.score).toBe(10);
    expect(result.blockers.some((b) => b.includes("No test"))).toBe(true);
  });

  it("floors at L1 when tests but no CI", () => {
    const result = computeReadiness(SIGNALS_TESTS_NO_CI);
    expect(result.tier).toBe("L1");
    expect(result.score).toBe(25);
    expect(result.blockers.some((b) => b.includes("No CI"))).toBe(true);
  });

  it("assigns L2 when tests + CI but no branch protection", () => {
    const result = computeReadiness(SIGNALS_L2);
    expect(result.tier).toBe("L2");
    expect(result.score).toBe(50);
    expect(result.blockers.some((b) => b.includes("branch protection"))).toBe(true);
  });

  it("boosts score with CODEOWNERS", () => {
    const result = computeReadiness(SIGNALS_L2_CODEOWNERS);
    expect(result.tier).toBe("L2");
    expect(result.score).toBe(60);
    expect(result.reasons.some((r) => r.includes("CODEOWNERS"))).toBe(true);
  });

  it("assigns L3 when tests + CI + branch protection + required checks", () => {
    const result = computeReadiness(SIGNALS_L3);
    expect(result.tier).toBe("L3");
    expect(result.score).toBe(90);
    expect(result.reasons.some((r) => r.includes("required checks"))).toBe(true);
  });

  it("refuses L3 when branch protection has no required checks", () => {
    const result = computeReadiness(SIGNALS_L3_NO_REQUIRED);
    expect(result.tier).toBe("L2");
    expect(result.score).toBe(70);
    expect(result.blockers.some((b) => b.includes("no required checks"))).toBe(true);
  });

  it("includes the raw signals in the result", () => {
    const result = computeReadiness(SIGNALS_L3);
    expect(result.signals.testCount).toBe(15);
    expect(result.signals.ciWorkflows).toContain("build-test.yml");
  });
});

describe("formatReadinessReport", () => {
  it("includes the tier and score", () => {
    const result = computeReadiness(SIGNALS_L3);
    const report = formatReadinessReport(result);
    expect(report).toContain("L3");
    expect(report).toContain("90");
  });

  it("includes reasons", () => {
    const result = computeReadiness(SIGNALS_L2);
    const report = formatReadinessReport(result);
    expect(report).toContain("Reasons");
    expect(report).toContain("Tests found");
  });

  it("includes blockers when present", () => {
    const result = computeReadiness(SIGNALS_L2);
    const report = formatReadinessReport(result);
    expect(report).toContain("Blockers");
    expect(report).toContain("branch protection");
  });

  it("includes the trust ladder explanation", () => {
    const result = computeReadiness(SIGNALS_L2);
    const report = formatReadinessReport(result);
    expect(report).toContain("L1");
    expect(report).toContain("L2");
    expect(report).toContain("L3");
    expect(report).toContain("report-only");
    expect(report).toContain("auto-merge");
  });

  it("includes the signals table", () => {
    const result = computeReadiness(SIGNALS_L3);
    const report = formatReadinessReport(result);
    expect(report).toContain("Signals");
    expect(report).toContain("Branch protection");
    expect(report).toContain("CODEOWNERS");
  });
});

function mockOctokit(
  tree: Array<{ type: string; path: string }>,
  protection?: { required_status_checks?: { contexts?: string[]; checks?: Array<{ context: string }> } } | null
): Octokit {
  return {
    rest: {
      repos: {
        get: async () => ({ data: { default_branch: "main" } }),
        getBranchProtection: async () => {
          if (protection === undefined) throw new Error("no admin scope");
          return { data: protection };
        },
      },
      git: {
        getTree: async () => ({ data: { tree } }),
      },
    },
  } as unknown as Octokit;
}

describe("readReadiness", () => {
  it("assigns L2 when tests + CI exist without branch protection", async () => {
    const octokit = mockOctokit([
      { type: "blob", path: "src/foo.test.ts" },
      { type: "blob", path: ".github/workflows/ci.yml" },
    ]);
    const result = await readReadiness(octokit, "o", "r");
    expect(result.tier).toBe("L2");
    expect(result.signals.hasTests).toBe(true);
    expect(result.signals.hasCI).toBe(true);
    expect(result.signals.hasBranchProtection).toBe(false);
    expect(result.signals.testCount).toBe(1);
  });

  it("assigns L3 when branch protection has required checks", async () => {
    const octokit = mockOctokit(
      [
        { type: "blob", path: "test/bar.test.ts" },
        { type: "blob", path: ".github/workflows/build.yml" },
        { type: "blob", path: "CODEOWNERS" },
      ],
      { required_status_checks: { contexts: ["foreman/done-contract"], checks: [] } }
    );
    const result = await readReadiness(octokit, "o", "r");
    expect(result.tier).toBe("L3");
    expect(result.signals.hasBranchProtection).toBe(true);
    expect(result.signals.requiredChecks).toContain("foreman/done-contract");
    expect(result.signals.hasCodeowners).toBe(true);
  });

  it("falls back to unprotected when getBranchProtection throws", async () => {
    const octokit = mockOctokit([
      { type: "blob", path: "tests/bar.spec.js" },
      { type: "blob", path: ".github/workflows/test.yaml" },
    ]);
    const result = await readReadiness(octokit, "o", "r");
    expect(result.tier).toBe("L2");
    expect(result.signals.hasBranchProtection).toBe(false);
  });

  it("floors at L1 when no tests are found", async () => {
    const octokit = mockOctokit([{ type: "blob", path: ".github/workflows/ci.yml" }]);
    const result = await readReadiness(octokit, "o", "r");
    expect(result.tier).toBe("L1");
    expect(result.signals.hasTests).toBe(false);
  });
});
