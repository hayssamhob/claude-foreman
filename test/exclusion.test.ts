import { describe, it, expect } from "vitest";
import {
  DEFAULT_BANNED_PATHS,
  checkExclusion,
  preflightExclusion,
  generateCodeowners,
  missingCodeownersEntries,
} from "../src/guard/exclusion.js";

describe("checkExclusion", () => {
  it("flags auth paths", () => {
    const result = checkExclusion(["src/auth/login.ts"]);
    expect(result.banned).toBe(true);
    expect(result.matchedPaths[0].bannedPath.category).toBe("auth");
  });

  it("flags payment paths", () => {
    const result = checkExclusion(["src/payments/stripe.ts"]);
    expect(result.banned).toBe(true);
    expect(result.matchedPaths[0].bannedPath.category).toBe("payments");
  });

  it("flags secret paths", () => {
    const result = checkExclusion([".env.production", "src/secrets/vault.ts"]);
    expect(result.banned).toBe(true);
    expect(result.matchedPaths.length).toBeGreaterThanOrEqual(1);
  });

  it("flags migration paths", () => {
    const result = checkExclusion(["db/migrations/001_init.sql"]);
    expect(result.banned).toBe(true);
    expect(result.matchedPaths[0].bannedPath.category).toBe("migrations");
  });

  it("flags spend paths", () => {
    const result = checkExclusion(["src/spend/tracker.ts"]);
    expect(result.banned).toBe(true);
    expect(result.matchedPaths[0].bannedPath.category).toBe("spend");
  });

  it("does not flag safe paths", () => {
    const result = checkExclusion(["src/utils/helpers.ts", "test/foo.test.ts", "README.md"]);
    expect(result.banned).toBe(false);
    expect(result.matchedPaths).toEqual([]);
  });

  it("handles mixed safe and banned paths", () => {
    const result = checkExclusion(["src/utils/helpers.ts", "src/auth/login.ts"]);
    expect(result.banned).toBe(true);
    expect(result.matchedPaths).toHaveLength(1);
    expect(result.matchedPaths[0].path).toBe("src/auth/login.ts");
  });
});

describe("preflightExclusion", () => {
  it("passes for safe paths", () => {
    const result = preflightExclusion(["src/utils/helpers.ts"]);
    expect(result.ok).toBe(true);
    expect(result.escalated).toBe(false);
  });

  it("fails and escalates for banned paths", () => {
    const result = preflightExclusion(["src/auth/login.ts"]);
    expect(result.ok).toBe(false);
    expect(result.escalated).toBe(true);
    expect(result.reason).toContain("Exclusion list violation");
    expect(result.reason).toContain("auth");
  });

  it("includes the matched paths in the reason", () => {
    const result = preflightExclusion(["src/auth/login.ts", "src/payments/stripe.ts"]);
    expect(result.reason).toContain("src/auth/login.ts");
    expect(result.reason).toContain("src/payments/stripe.ts");
  });

  it("passes for empty file list", () => {
    const result = preflightExclusion([]);
    expect(result.ok).toBe(true);
    expect(result.escalated).toBe(false);
  });
});

describe("generateCodeowners", () => {
  it("generates a CODEOWNERS file with all banned paths", () => {
    const content = generateCodeowners("hayssamhob");
    expect(content).toContain("# CODEOWNERS");
    expect(content).toContain("@hayssamhob");
    expect(content).toContain("**/auth/**");
    expect(content).toContain("**/payment*/**");
    expect(content).toContain("**/secret*");
    expect(content).toContain("**/migration*/**");
  });

  it("includes comments explaining each entry", () => {
    const content = generateCodeowners("owner");
    expect(content).toContain("Authentication code");
    expect(content).toContain("Payment processing");
    expect(content).toContain("Secrets management");
  });
});

describe("missingCodeownersEntries", () => {
  it("returns all banned paths for an empty CODEOWNERS", () => {
    const missing = missingCodeownersEntries("", DEFAULT_BANNED_PATHS);
    expect(missing.length).toBe(DEFAULT_BANNED_PATHS.length);
  });

  it("returns paths not present in the CODEOWNERS", () => {
    // Cover all auth and payments patterns
    const existing = generateCodeowners("owner", DEFAULT_BANNED_PATHS.filter(
      (p) => p.category === "auth" || p.category === "payments"
    ));
    const missing = missingCodeownersEntries(existing, DEFAULT_BANNED_PATHS);
    expect(missing.some((m) => m.category === "auth")).toBe(false);
    expect(missing.some((m) => m.category === "payments")).toBe(false);
    expect(missing.some((m) => m.category === "secrets")).toBe(true);
  });

  it("returns empty when all paths are covered", () => {
    const full = generateCodeowners("owner", DEFAULT_BANNED_PATHS);
    const missing = missingCodeownersEntries(full, DEFAULT_BANNED_PATHS);
    expect(missing).toEqual([]);
  });
});
