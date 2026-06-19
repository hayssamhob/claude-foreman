import { describe, expect, it } from "vitest";
import { Store } from "../src/state/db.js";
import { sweepSilentAgents } from "../src/leases.js";
import { config } from "../src/config.js";

const NOOP = () => {};
const MIN = 60_000;
const NOW = 1_700_000_000_000;
const TTL = config.leaseTtlMinutes * MIN;

/** Set a claimed task's lease so its last heartbeat was `silentMin` before `at`. */
function silentSince(store: Store, agent: string, issue: number, silentMin: number, at = NOW) {
  store.upsertTask({ repo: "o/r", issue, installation_id: 1, agent, status: "claimed" });
  store.updateTask("o/r", issue, { lease_expires_at: at - silentMin * MIN + TTL });
}

describe("silent-agent early warning", () => {
  it("warns once for an agent silent past its threshold, then stays quiet", () => {
    const store = new Store(":memory:");
    silentSince(store, "devin", 1, 45); // devin threshold = 30 min

    sweepSilentAgents(store, NOOP, NOW);
    const warned = store.getTask("o/r", 1)!.stale_warned_at;
    expect(warned).toBe(NOW);

    // Second sweep within the same silence streak must not re-warn.
    sweepSilentAgents(store, NOOP, NOW + MIN);
    expect(store.getTask("o/r", 1)!.stale_warned_at).toBe(NOW);
  });

  it("does not warn while the agent is within normal working silence", () => {
    const store = new Store(":memory:");
    silentSince(store, "devin", 2, 10); // < 30 min threshold
    sweepSilentAgents(store, NOOP, NOW);
    expect(store.getTask("o/r", 2)!.stale_warned_at).toBeNull();
  });

  it("never warns for agents with monitoring disabled (threshold 0)", () => {
    const store = new Store(":memory:");
    silentSince(store, "claude-jr", 3, 90); // claude-jr threshold = 0 (we monitor it directly)
    sweepSilentAgents(store, NOOP, NOW);
    expect(store.getTask("o/r", 3)!.stale_warned_at).toBeNull();
  });

  it("re-arms after a fresh heartbeat then a new silence streak", () => {
    const store = new Store(":memory:");
    silentSince(store, "devin", 4, 45, NOW);
    sweepSilentAgents(store, NOOP, NOW);
    expect(store.getTask("o/r", 4)!.stale_warned_at).toBe(NOW);

    // Heartbeat 1 min later renews the lease (lastRenewal = NOW+1min). No warning.
    store.updateTask("o/r", 4, { lease_expires_at: NOW + MIN + TTL });
    sweepSilentAgents(store, NOOP, NOW + MIN);
    expect(store.getTask("o/r", 4)!.stale_warned_at).toBe(NOW);

    // 40 min of fresh silence after that heartbeat → warns again.
    sweepSilentAgents(store, NOOP, NOW + MIN + 40 * MIN);
    expect(store.getTask("o/r", 4)!.stale_warned_at).toBe(NOW + 41 * MIN);
  });
});
