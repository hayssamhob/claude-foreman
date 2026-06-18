import { describe, expect, it } from "vitest";
import { parseRateLimit, parseResetAt } from "../src/ratelimit.js";

// Fixed reference: 2026-06-13 00:00:00 local time.
const NOW = new Date(2026, 5, 13, 0, 0, 0, 0).getTime();

describe("parseRateLimit", () => {
  it("detects the Claude Code session-limit string", () => {
    const r = parseRateLimit("You've hit your session limit · resets 2:20am (Africa/Casablanca)", NOW);
    expect(r.limited).toBe(true);
    expect(r.reason).toBe("session limit");
    expect(r.resetAt).toBe(new Date(2026, 5, 13, 2, 20, 0, 0).getTime());
  });

  it("detects HTTP 429 and too-many-requests", () => {
    expect(parseRateLimit("Error: 429 Too Many Requests", NOW).limited).toBe(true);
    expect(parseRateLimit("rate limit exceeded", NOW).limited).toBe(true);
    expect(parseRateLimit("quota exhausted", NOW).limited).toBe(true);
  });

  it("does not flag normal output", () => {
    expect(parseRateLimit("Build succeeded; 3 tests passed", NOW).limited).toBe(false);
    expect(parseRateLimit('{"verdict":"approve"}', NOW).limited).toBe(false);
    expect(parseRateLimit("", NOW).limited).toBe(false);
  });
});

describe("parseResetAt", () => {
  it("parses Retry-After seconds", () => {
    expect(parseResetAt("Retry-After: 120", NOW)).toBe(NOW + 120_000);
  });

  it("parses relative 'try again in N minutes/hours'", () => {
    expect(parseResetAt("please try again in 5 minutes", NOW)).toBe(NOW + 5 * 60_000);
    expect(parseResetAt("available again in 2 hours", NOW)).toBe(NOW + 2 * 3_600_000);
  });

  it("parses 24h clock and rolls past times to tomorrow", () => {
    // 00:30 is after our NOW of 00:00 → same day
    expect(parseResetAt("resets at 0:30", NOW)).toBe(new Date(2026, 5, 13, 0, 30).getTime());
    // a pm time later today
    expect(parseResetAt("resets at 14:30", NOW)).toBe(new Date(2026, 5, 13, 14, 30).getTime());
  });

  it("returns null when no reset time is present", () => {
    expect(parseResetAt("rate limited, sorry", NOW)).toBeNull();
  });
});
