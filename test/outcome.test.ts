import { describe, it, expect } from "vitest";
import { routeOutcome } from "../src/referee/outcome.js";
import type { ReviewResult } from "../src/manager/worker.js";

describe("routeOutcome", () => {
  it("approve verdict → { action: 'approve' }", () => {
    const result: ReviewResult = { verdict: "approve", summary: "lgtm", points: [] };
    expect(routeOutcome(result)).toEqual({ action: "approve" });
  });

  it("request_changes with points → { action: 'request_changes', points }", () => {
    const result: ReviewResult = {
      verdict: "request_changes",
      summary: "needs work",
      points: ["fix types", "add test"],
    };
    expect(routeOutcome(result)).toEqual({ action: "request_changes", points: ["fix types", "add test"] });
  });

  it("request_changes with no points → points is []", () => {
    const result: ReviewResult = { verdict: "request_changes", summary: "needs work", points: [] };
    expect(routeOutcome(result)).toEqual({ action: "request_changes", points: [] });
  });

  it("routeOutcome is pure — same input produces same output", () => {
    const result: ReviewResult = { verdict: "approve", summary: "lgtm", points: [] };
    expect(routeOutcome(result)).toEqual(routeOutcome(result));
  });

  it("null input → { action: 'fail' }", () => {
    expect(routeOutcome(null as unknown as ReviewResult)).toEqual({
      action: "fail",
      reason: "Invalid or null review result",
    });
  });

  it("unknown verdict → { action: 'fail' }", () => {
    const result = { verdict: "hallucinated", summary: "?", points: [] } as unknown as ReviewResult;
    expect(routeOutcome(result).action).toBe("fail");
  });
});
