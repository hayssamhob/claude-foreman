import { describe, it, expect, beforeEach, vi } from "vitest";

const mockConfig = { defaultTrustTier: "L1" as "L1" | "L2" | "L3" };

vi.mock("../src/config.js", () => ({
  config: mockConfig,
}));

async function loadTier() {
  vi.resetModules();
  const mod = await import("../src/referee/trust-tier.js");
  return mod;
}

describe("trust tier configuration", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    mockConfig.defaultTrustTier = "L1";
    const { resetTrustTierLog } = await import("../src/referee/trust-tier.js");
    resetTrustTierLog();
  });

  it("returns the configured default trust tier", async () => {
    mockConfig.defaultTrustTier = "L2";
    const { getConfiguredTrustTier } = await loadTier();
    expect(getConfiguredTrustTier()).toBe("L2");
  });

  it("logs a transition when the tier changes between calls", async () => {
    const { logTrustTier } = await loadTier();
    const log = vi.fn();

    logTrustTier(log);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("transitioned"));

    mockConfig.defaultTrustTier = "L3";
    logTrustTier(log);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("transitioned: L1 -> L3"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("manual opt-in via DEFAULT_TRUST_TIER"));
  });

  it("does not log a transition when the tier stays the same", async () => {
    mockConfig.defaultTrustTier = "L2";
    const { logTrustTier } = await loadTier();
    const log = vi.fn();

    logTrustTier(log);
    logTrustTier(log);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("transitioned"));
  });
});
