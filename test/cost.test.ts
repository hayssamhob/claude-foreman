import { describe, it, expect, beforeEach, vi } from "vitest";

async function makeLedger(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const key of ["MAX_USD", "MAX_TOKENS", "MAX_QUEUE"]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  const { CostLedger } = await import("../src/cost.js");
  return new CostLedger();
}

const noop = () => {};

describe("CostLedger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accumulates tokens + usdCents across multiple record() calls", async () => {
    const ledger = await makeLedger();
    ledger.record(100, 50);
    ledger.record(200, 150);
    const snap = ledger.snapshot();
    expect(snap.tokens).toBe(300);
    expect(snap.usdCents).toBe(200);
  });

  it("trips on MAX_USD breach", async () => {
    const ledger = await makeLedger({ MAX_USD: "1.0" });
    ledger.record(0, 101); // 1.01 USD > 1.0
    const reason = ledger.check(0, noop);
    expect(reason).toBe("maxUsd");
    expect(ledger.isTripped()).toBe(true);
    expect(ledger.tripReason()).toBe("maxUsd");
  });

  it("trips on MAX_TOKENS breach", async () => {
    const ledger = await makeLedger({ MAX_TOKENS: "500" });
    ledger.record(501, 0);
    expect(ledger.check(0, noop)).toBe("maxTokens");
    expect(ledger.isTripped()).toBe(true);
  });

  it("trips on MAX_QUEUE depth breach", async () => {
    const ledger = await makeLedger({ MAX_QUEUE: "10" });
    expect(ledger.check(11, noop)).toBe("maxQueue");
    expect(ledger.isTripped()).toBe(true);
  });

  it("does not trip when under all ceilings", async () => {
    const ledger = await makeLedger({ MAX_USD: "10", MAX_TOKENS: "1000", MAX_QUEUE: "100" });
    ledger.record(50, 50);
    expect(ledger.check(5, noop)).toBeNull();
    expect(ledger.isTripped()).toBe(false);
  });

  it("returns existing trip reason without re-notifying on repeated check", async () => {
    const ledger = await makeLedger({ MAX_USD: "1.0" });
    ledger.record(0, 101);
    const log = vi.fn();
    ledger.check(0, log);
    ledger.check(0, log);
    expect(log).toHaveBeenCalledTimes(1);
    expect(ledger.tripReason()).toBe("maxUsd");
  });

  it("reset() clears totals and trip; subsequent check passes", async () => {
    const ledger = await makeLedger({ MAX_USD: "1.0" });
    ledger.record(0, 200);
    ledger.check(0, noop);
    expect(ledger.isTripped()).toBe(true);
    ledger.reset();
    expect(ledger.isTripped()).toBe(false);
    expect(ledger.snapshot().tokens).toBe(0);
    expect(ledger.snapshot().usdCents).toBe(0);
    expect(ledger.check(0, noop)).toBeNull();
  });

  it("record() is a no-op when already tripped", async () => {
    const ledger = await makeLedger({ MAX_TOKENS: "100" });
    ledger.record(101, 0);
    ledger.check(0, noop);
    ledger.record(999, 999); // tripped — should not accumulate
    expect(ledger.snapshot().tokens).toBe(101);
    expect(ledger.snapshot().usdCents).toBe(0);
  });
});
