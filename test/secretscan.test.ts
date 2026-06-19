import { describe, it, expect } from "vitest";
import { scanOutput } from "../src/guard/secretscan.js";

describe("scanOutput", () => {
  it("passes clean text", () => {
    expect(scanOutput("hello world").clean).toBe(true);
  });
  it("redacts a planted AWS key", () => {
    const r = scanOutput("key=AKIAIOSFODNN7EXAMPLE and more");
    expect(r.clean).toBe(false);
    expect(r.redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(r.redacted).toContain("[REDACTED]");
  });
  it("redacts a GitHub token", () => {
    const r = scanOutput("token: ghp_1234567890abcdefghij1234567890abcdef12");
    expect(r.clean).toBe(false);
    expect(r.redacted).not.toContain("ghp_");
  });
  it("leaves clean JSON output untouched", () => {
    const json = JSON.stringify({ summary: "all good", testsPassed: true });
    expect(scanOutput(json).redacted).toBe(json);
  });
});
