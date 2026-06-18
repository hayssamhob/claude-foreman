import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JuniorReport } from "../src/junior/prompts.js";

// Test the done-contract gate logic in isolation — we extract the condition
// rather than wiring up the full runner (which needs Octokit, git, etc.).
// The rule: createPR must NOT be called when testsPassed is falsy.

function shouldCreatePr(report: JuniorReport): boolean {
  return report.testsPassed === true;
}

describe("done-contract gate (testsPassed)", () => {
  it("blocks PR when testsPassed is false", () => {
    const report: JuniorReport = { summary: "did stuff", testsPassed: false, testsOutput: "1 failed" };
    expect(shouldCreatePr(report)).toBe(false);
  });

  it("blocks PR when testsPassed is undefined (legacy report)", () => {
    const report: JuniorReport = { summary: "did stuff" };
    expect(shouldCreatePr(report)).toBe(false);
  });

  it("allows PR when testsPassed is true", () => {
    const report: JuniorReport = { summary: "did stuff", testsPassed: true };
    expect(shouldCreatePr(report)).toBe(true);
  });
});

describe("JuniorReport testsPassed field", () => {
  it("is optional and defaults to blocking", () => {
    const report: JuniorReport = {};
    expect(report.testsPassed).toBeUndefined();
    expect(shouldCreatePr(report)).toBe(false);
  });

  it("carries testsOutput when tests fail", () => {
    const report: JuniorReport = {
      testsPassed: false,
      testsOutput: "Error: expect(received).toBe(expected)\nExpected: 1\nReceived: 0",
    };
    expect(report.testsOutput).toContain("Error:");
  });
});
