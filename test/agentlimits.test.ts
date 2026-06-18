import { describe, expect, it } from "vitest";
import { Store } from "../src/state/db.js";
import { recordRateLimit, sweepRateLimitRecoveries, providerLabel } from "../src/agentlimits.js";

const NOOP = () => {};

describe("rate-limit recovery", () => {
  it("reports an agent as recovered once its reset time passes, without mutating on read", () => {
    const store = new Store(":memory:");
    const past = Date.now() - 1000;
    recordRateLimit(store, ["windsurf"], "session limit", past, NOOP);

    // Effective read says ok (reset passed)...
    expect(store.isRateLimited("windsurf")).toBe(false);
    // ...but the stored row is still rate_limited, awaiting the recovery sweep.
    expect(store.recoveredAgents().map((r) => r.agent)).toContain("windsurf");

    sweepRateLimitRecoveries(store, NOOP);

    // Now the storage itself is cleared and there is nothing left to recover.
    expect(store.recoveredAgents()).toHaveLength(0);
    expect(store.agentStatus("windsurf").state).toBe("ok");
    expect(store.agentStatus("windsurf").reset_at).toBeNull();
  });

  it("does not treat a still-limited agent as recovered", () => {
    const store = new Store(":memory:");
    const future = Date.now() + 60 * 60_000;
    recordRateLimit(store, ["devin"], "429", future, NOOP);

    expect(store.isRateLimited("devin")).toBe(true);
    expect(store.recoveredAgents()).toHaveLength(0);

    sweepRateLimitRecoveries(store, NOOP);
    expect(store.agentStatus("devin").state).toBe("rate_limited");
  });

  it("collapses the shared Claude account (manager + junior) under one label", () => {
    expect(providerLabel("manager")).toBe("Claude");
    expect(providerLabel("claude")).toBe("Claude");
    expect(providerLabel("windsurf")).toBe("Windsurf");
    expect(providerLabel("devin")).toBe("Devin");
  });
});
