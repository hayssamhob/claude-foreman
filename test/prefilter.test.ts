import { describe, it, expect } from "vitest";
import { preFilterReview } from "../src/referee/prefilter.js";
import type { CiState } from "../src/threads.js";

describe("preFilterReview", () => {
  it("passes green CI", () => {
    expect(preFilterReview({ overall: "green", detail: "3 checks passed" })).toEqual({ proceed: true });
  });

  it("passes pending CI so the coach can review while tests finish", () => {
    expect(preFilterReview({ overall: "pending", detail: "ci running" })).toEqual({ proceed: true });
  });

  it("passes when no CI is configured", () => {
    expect(preFilterReview({ overall: "none", detail: "no checks" })).toEqual({ proceed: true });
  });

  it("bounces red CI with the failing check names", () => {
    const result = preFilterReview({ overall: "red", detail: "lint, test" });
    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.reason).toBe("automated checks are failing");
      expect(result.detail).toBe("lint, test");
    }
  });
});
