import { describe, expect, it, beforeEach } from "vitest";
import { StallDetector } from "../src/referee/stall.js";

describe("StallDetector", () => {
  let detector: StallDetector;
  beforeEach(() => { detector = new StallDetector(); });

  it("does not fire before threshold rounds", () => {
    expect(detector.check("", 1, 3)).toBeNull();
    expect(detector.check("", 2, 3)).toBeNull();
  });

  it("fires on the threshold round with empty diff", () => {
    detector.check("", 1, 3);
    detector.check("", 2, 3);
    const signal = detector.check("", 3, 3);
    expect(signal?.type).toBe("stall");
    expect(signal?.rounds).toBe(3);
  });

  it("fires when diff is identical across rounds", () => {
    const diff = "@@ -1,2 +1,2 @@\n-x\n+y";
    detector.check(diff, 1, 3); // first call sets lastDiff
    detector.check(diff, 2, 3); // same → zero progress
    detector.check(diff, 3, 3); // same → zero progress
    const signal = detector.check(diff, 4, 3);
    expect(signal?.type).toBe("stall");
  });

  it("resets counter when progress is made", () => {
    detector.check("", 1, 3);
    detector.check("", 2, 3);
    expect(detector.check("@@ -1 +1 @@\n-x\n+y", 3, 3)).toBeNull(); // progress → reset
    expect(detector.check("", 4, 3)).toBeNull(); // counter restarted
  });

  it("reset() clears all state", () => {
    detector.check("", 1, 3);
    detector.check("", 2, 3);
    detector.reset();
    expect(detector.check("", 3, 3)).toBeNull();
  });
});
