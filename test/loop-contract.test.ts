import { describe, it, expect } from "vitest";
import { validateLoopContract } from "../src/protocol/messages.js";
import { buildTaskBody } from "../src/manager/worker.js";

describe("LoopContract Validation", () => {
  it("validates a complete valid contract", () => {
    const valid = {
      trigger: "issue labeled",
      scope: ["src/**"],
      action: "do stuff",
      budget: { maxTokens: 100, maxUsd: 1.5 },
      stop: "tests pass",
      report: "@hayssamhob ✅ #1 done",
    };
    expect(validateLoopContract(valid)).toEqual(valid);
  });

  it("returns null for missing trigger", () => {
    expect(validateLoopContract({
      scope: ["src/**"],
      action: "do stuff",
      budget: {},
      stop: "stop",
      report: "report"
    })).toBeNull();
  });

  it("returns null for empty scope array", () => {
    expect(validateLoopContract({
      trigger: "t",
      scope: [],
      action: "a",
      budget: {},
      stop: "s",
      report: "r"
    })).toBeNull();
  });

  it("returns null for non-string scope element", () => {
    expect(validateLoopContract({
      trigger: "t",
      scope: ["valid", 123],
      action: "a",
      budget: {},
      stop: "s",
      report: "r"
    })).toBeNull();
  });

  it("returns null for non-positive maxTokens", () => {
    expect(validateLoopContract({
      trigger: "t",
      scope: ["src/**"],
      action: "a",
      budget: { maxTokens: 0 },
      stop: "s",
      report: "r"
    })).toBeNull();
  });

  it("returns null for missing budget object", () => {
    expect(validateLoopContract({
      trigger: "t",
      scope: ["src/**"],
      action: "a",
      stop: "s",
      report: "r"
    })).toBeNull();
  });

  it("returns null for missing stop", () => {
    expect(validateLoopContract({
      trigger: "t",
      scope: ["src/**"],
      action: "a",
      budget: {},
      report: "r"
    })).toBeNull();
  });

  it("returns null for missing report", () => {
    expect(validateLoopContract({
      trigger: "t",
      scope: ["src/**"],
      action: "a",
      budget: {},
      stop: "s"
    })).toBeNull();
  });
});

describe("buildTaskBody with LoopContract", () => {
  it("renders the contract when provided", () => {
    const contract = {
      trigger: "issue created",
      scope: ["src/index.ts"],
      action: "add feature",
      budget: { maxUsd: 2.50 },
      stop: "all green",
      report: "@hayssamhob ✅ done",
    };
    const body = buildTaskBody("Fix things", "agent", 1, "repo", 2, ["Check logs"], "context", false, contract);
    
    expect(body).toContain("## Loop Contract");
    expect(body).toContain("- **Trigger**: issue created");
    expect(body).toContain("- **Scope**: src/index.ts");
    expect(body).toContain("- **Action**: add feature");
    expect(body).toContain("- **Budget**: $2.5");
    expect(body).toContain("- **Stop**: all green");
    expect(body).toContain("- **Report**: @hayssamhob ✅ done");
  });

  it("does not render Loop Contract section if not provided", () => {
    const body = buildTaskBody("Fix things", "agent", 1, "repo", 2, [], "");
    expect(body).not.toContain("## Loop Contract");
  });
});
