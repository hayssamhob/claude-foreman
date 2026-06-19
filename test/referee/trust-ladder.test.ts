import { describe, it, expect } from "vitest";
import {
  parseTrustLabel,
  resolveTrustTier,
  enforceTierAction,
  isValidTransition,
  logTierTransition,
  TIER_ACTIONS,
  type TierTransition,
} from "../../src/referee/trust-ladder.js";
import type { Store } from "../../src/state/db.js";

describe("parseTrustLabel", () => {
  it("parses trust:L1", () => {
    expect(parseTrustLabel("trust:L1")).toBe("L1");
  });

  it("parses trust:L2", () => {
    expect(parseTrustLabel("trust:L2")).toBe("L2");
  });

  it("parses trust:L3", () => {
    expect(parseTrustLabel("trust:L3")).toBe("L3");
  });

  it("parses lowercase labels", () => {
    expect(parseTrustLabel("trust:l1")).toBe("L1");
    expect(parseTrustLabel("trust:l2")).toBe("L2");
    expect(parseTrustLabel("trust:l3")).toBe("L3");
  });

  it("returns null for non-trust labels", () => {
    expect(parseTrustLabel("agent:devin")).toBeNull();
    expect(parseTrustLabel("status:queued")).toBeNull();
    expect(parseTrustLabel("epic:M1")).toBeNull();
  });
});

describe("resolveTrustTier", () => {
  it("returns manual override from labels", () => {
    expect(resolveTrustTier(["agent:devin", "trust:L2", "status:queued"])).toBe("L2");
  });

  it("returns L3 when trust:L3 label is present", () => {
    expect(resolveTrustTier(["trust:L3"])).toBe("L3");
  });

  it("falls back to computed tier when no trust label", () => {
    expect(resolveTrustTier(["agent:devin"], "L2")).toBe("L2");
  });

  it("defaults to L1 when no label and no computed tier", () => {
    expect(resolveTrustTier(["agent:devin"])).toBe("L1");
  });

  it("prioritizes manual label over computed tier", () => {
    expect(resolveTrustTier(["trust:L1"], "L3")).toBe("L1");
  });
});

describe("enforceTierAction", () => {
  describe("L1 (report-only)", () => {
    it("blocks low-risk PRs", () => {
      const result = enforceTierAction("L1", "low");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("L1");
    });

    it("blocks medium-risk PRs", () => {
      const result = enforceTierAction("L1", "medium");
      expect(result.allowed).toBe(false);
    });

    it("blocks high-risk PRs", () => {
      const result = enforceTierAction("L1", "high");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("high-risk");
    });
  });

  describe("L2 (patch-only)", () => {
    it("allows low-risk PRs", () => {
      const result = enforceTierAction("L2", "low");
      expect(result.allowed).toBe(true);
    });

    it("blocks medium-risk PRs", () => {
      const result = enforceTierAction("L2", "medium");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("L2");
    });

    it("blocks high-risk PRs", () => {
      const result = enforceTierAction("L2", "high");
      expect(result.allowed).toBe(false);
    });
  });

  describe("L3 (auto-merge)", () => {
    it("allows low-risk PRs", () => {
      const result = enforceTierAction("L3", "low");
      expect(result.allowed).toBe(true);
    });

    it("allows medium-risk PRs", () => {
      const result = enforceTierAction("L3", "medium");
      expect(result.allowed).toBe(true);
    });

    it("blocks high-risk PRs", () => {
      const result = enforceTierAction("L3", "high");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("high-risk");
    });
  });
});

describe("TIER_ACTIONS", () => {
  it("L1 has no auto-merge", () => {
    expect(TIER_ACTIONS.L1.autoMerge).toBe(false);
    expect(TIER_ACTIONS.L1.autoMergeLowRisk).toBe(false);
  });

  it("L2 allows low-risk only", () => {
    expect(TIER_ACTIONS.L2.autoMergeLowRisk).toBe(true);
    expect(TIER_ACTIONS.L2.autoMergeMediumRisk).toBe(false);
  });

  it("L3 allows low + medium", () => {
    expect(TIER_ACTIONS.L3.autoMergeLowRisk).toBe(true);
    expect(TIER_ACTIONS.L3.autoMergeMediumRisk).toBe(true);
  });

  it("each tier has a description", () => {
    expect(TIER_ACTIONS.L1.description).toBeTruthy();
    expect(TIER_ACTIONS.L2.description).toBeTruthy();
    expect(TIER_ACTIONS.L3.description).toBeTruthy();
  });
});

describe("isValidTransition", () => {
  it("allows L1 → L2", () => {
    expect(isValidTransition("L1", "L2")).toBe(true);
  });

  it("allows L2 → L3", () => {
    expect(isValidTransition("L2", "L3")).toBe(true);
  });

  it("allows L3 → L1 (downgrade)", () => {
    expect(isValidTransition("L3", "L1")).toBe(true);
  });

  it("allows same tier (no transition)", () => {
    expect(isValidTransition("L2", "L2")).toBe(true);
  });
});

describe("logTierTransition", () => {
  it("logs a transition via the store handoff note", () => {
    const notes: string[] = [];
    const mockStore = {
      saveHandoffNote: (note: string, author: string | null) => notes.push({ note, author }),
    } as unknown as Store;

    const transition: TierTransition = {
      repo: "owner/repo",
      from: "L1",
      to: "L2",
      reason: "manual opt-in via trust:L2 label",
      timestamp: Date.now(),
    };

    logTierTransition(mockStore, transition);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toContain("owner/repo");
    expect(notes[0].note).toContain("L1");
    expect(notes[0].note).toContain("L2");
    expect(notes[0].note).toContain("manual opt-in");
    expect(notes[0].author).toBe("trust-ladder");
  });
});
