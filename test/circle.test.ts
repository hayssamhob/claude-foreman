import { describe, expect, it, beforeEach } from "vitest";
import { CircleDetector, CircleType } from "../src/referee/circle.js";

describe("CircleDetector", () => {
  let detector: CircleDetector;
  beforeEach(() => { detector = new CircleDetector(); });

  it("returns null on the first attempt", () => {
    expect(detector.check(1, ["a.ts"], "@@ -1,3 +1,3 @@\n-old\n+new", [])).toBeNull();
  });

  it("detects SAME_REGION when overlapping hunk in same files", () => {
    detector.check(1, ["a.ts"], "@@ -1,3 +1,3 @@\n-old\n+new", []);
    const result = detector.check(2, ["a.ts"], "@@ -1,3 +1,3 @@\n-new\n+old", []);
    expect(result).toBe(CircleType.SAME_REGION);
  });

  it("detects SAME_ERROR on repeated error signature", () => {
    detector.check(1, ["a.ts"], "", ["TS2345: bad type here"]);
    const result = detector.check(2, ["b.ts"], "", ["TS2345: same error code, different message"]);
    expect(result).toBe(CircleType.SAME_ERROR);
  });

  it("detects NET_ZERO when adds/removes mirror each other", () => {
    const diff1 = "@@ -1,2 +1,2 @@\n-foo\n+bar";
    const diff2 = "@@ -2,2 +2,2 @@\n-bar\n+foo";
    detector.check(1, ["a.ts"], diff1, []);
    const result = detector.check(2, ["a.ts"], diff2, []);
    expect(result).toBe(CircleType.NET_ZERO);
  });

  it("returns null when there is genuine forward progress (new region, new lines)", () => {
    detector.check(1, ["a.ts"], "@@ -1,3 +1,3 @@\n-x\n+y", []);
    // Different hunk region + different lines — no signal should fire
    expect(detector.check(2, ["a.ts"], "@@ -50,3 +50,3 @@\n-alpha\n+beta", [])).toBeNull();
  });

  it("resets history on reset()", () => {
    detector.check(1, ["a.ts"], "@@ -1,3 +1,3 @@\n-x\n+y", []);
    detector.reset();
    expect(detector.check(2, ["a.ts"], "@@ -1,3 +1,3 @@\n-y\n+x", [])).toBeNull();
  });
});
