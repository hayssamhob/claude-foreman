import { describe, it, expect } from "vitest";
import { applyEffort } from "../src/config.js";

describe("applyEffort", () => {
  it("returns cmd unchanged when effort is undefined", () => {
    expect(applyEffort("claude -p --max-turns 1", undefined)).toBe("claude -p --max-turns 1");
  });
  it("replaces existing --max-turns when effort is set", () => {
    expect(applyEffort("claude -p --output-format json --max-turns 1", 5)).toBe("claude -p --output-format json --max-turns 5");
  });
  it("appends --max-turns when not present", () => {
    expect(applyEffort("claude -p --output-format json --dangerously-skip-permissions", 10)).toBe("claude -p --output-format json --dangerously-skip-permissions --max-turns 10");
  });
  it("does not modify non-claude commands", () => {
    expect(applyEffort("custom-script.sh --arg 1", 5)).toBe("custom-script.sh --arg 1");
  });
  it("handles cmd with leading whitespace", () => {
    expect(applyEffort("  claude -p --max-turns 1", 3)).toBe("  claude -p --max-turns 3");
  });
  it("preserves --tools empty string arg", () => {
    const result = applyEffort('claude -p --output-format json --tools "" --max-turns 1', 3);
    expect(result).toContain('--tools ""');
    expect(result).toContain("--max-turns 3");
    expect(result).not.toContain("--max-turns 1");
  });
});
