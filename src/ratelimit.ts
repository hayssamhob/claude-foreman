/**
 * Rate-limit / session-limit detection.
 *
 * Every agent we drive (the headless Claude manager, the in-process Claude
 * junior) and every agent that reports to us (Antigravity, Windsurf) can hit a
 * provider limit. When that happens the useful thing is not to fail the work
 * but to KNOW: which agent is down, and until when — so the fleet can back off
 * and the owner can decide to wait or route elsewhere.
 *
 * This module turns the messy, human-readable strings these tools emit
 * ("You've hit your session limit · resets 2:20am", "429 Too Many Requests",
 * "Retry-After: 120") into a structured verdict.
 */

export interface RateLimitInfo {
  limited: boolean;
  reason: string; // short human-readable cause, e.g. "session limit"
  resetAt: number | null; // epoch ms when the limit is expected to clear, if known
}

export class RateLimitedError extends Error {
  resetAt: number | null;
  reason: string;
  constructor(reason: string, resetAt: number | null) {
    super(`rate limited: ${reason}${resetAt ? ` (resets ${new Date(resetAt).toISOString()})` : ""}`);
    this.name = "RateLimitedError";
    this.reason = reason;
    this.resetAt = resetAt;
  }
}

const LIMIT_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /session limit/i, reason: "session limit" },
  { re: /usage limit/i, reason: "usage limit" },
  { re: /rate[\s-]?limit/i, reason: "rate limit" },
  { re: /too many requests/i, reason: "too many requests" },
  { re: /quota (?:exceeded|exhausted|reached)/i, reason: "quota exceeded" },
  { re: /\b429\b/, reason: "HTTP 429 (rate limit)" },
  { re: /\b529\b|overloaded/i, reason: "service overloaded" },
  { re: /insufficient[_\s]?quota/i, reason: "out of quota" },
];

/**
 * Inspect arbitrary CLI/API output for a rate-limit signature and, when found,
 * a best-effort reset time. `now` is injectable for testing.
 */
export function parseRateLimit(text: string | null | undefined, now: number = Date.now()): RateLimitInfo {
  if (!text) return { limited: false, reason: "", resetAt: null };
  const hit = LIMIT_PATTERNS.find((p) => p.re.test(text));
  if (!hit) return { limited: false, reason: "", resetAt: null };
  return { limited: true, reason: hit.reason, resetAt: parseResetAt(text, now) };
}

/** Pull a reset time out of the text by any of the common phrasings. */
export function parseResetAt(text: string, now: number = Date.now()): number | null {
  // "Retry-After: 120" (seconds) or "retry after 120s"
  const retryAfter = text.match(/retry[\s-]?after[:\s]+(\d+)\s*(s|sec|seconds)?\b/i);
  if (retryAfter) return now + parseInt(retryAfter[1], 10) * 1000;

  // "try again in 30 seconds" / "in 5 minutes" / "in 2 hours"
  const tryIn = text.match(/(?:try again|retry|available again|back)\s+in\s+(\d+)\s*(second|minute|hour|sec|min|hr)s?/i);
  if (tryIn) {
    const n = parseInt(tryIn[1], 10);
    const unit = tryIn[2].toLowerCase();
    const ms = unit.startsWith("h") ? 3_600_000 : unit.startsWith("m") ? 60_000 : 1000;
    return now + n * ms;
  }

  // "resets 2:20am" / "resets at 14:30" / "resets at 2am"
  const clock = text.match(/reset[s]?\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock) {
    const at = nextClockTime(parseInt(clock[1], 10), clock[2] ? parseInt(clock[2], 10) : 0, clock[3], now);
    if (at) return at;
  }

  // ISO-ish timestamp after "reset"
  const iso = text.match(/reset[^0-9]{0,12}(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)/i);
  if (iso) {
    const t = Date.parse(iso[1].replace(" ", "T"));
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** The next future occurrence of a wall-clock time (server-local), as epoch ms. */
function nextClockTime(hour: number, minute: number, meridiem: string | undefined, now: number): number | null {
  if (hour > 23 || minute > 59) return null;
  let h = hour;
  if (meridiem) {
    const pm = /pm/i.test(meridiem);
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  const d = new Date(now);
  d.setHours(h, minute, 0, 0);
  let t = d.getTime();
  if (t <= now) t += 24 * 3_600_000; // already past today → next day
  return t;
}
