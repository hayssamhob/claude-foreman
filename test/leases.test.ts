import { describe, expect, it } from "vitest";
import { Store } from "../src/state/db.js";
import { sweepLeases } from "../src/leases.js";
import { config } from "../src/config.js";

const MIN = 60_000;
const NOW = 1_700_000_000_000;
const TTL = config.leaseTtlMinutes * MIN;

describe("sweepLeases", () => {
  it("reassigns to the next available fighter when a fighter's lease expires", async () => {
    const store = new Store(":memory:");
    store.upsertTask({ repo: "owner/repo", issue: 1, installation_id: 1, agent: config.agents[0], status: "claimed" });
    store.updateTask("owner/repo", 1, { lease_expires_at: NOW - 1000 }); // expired

    const log: string[] = [];
    const auth = async () => ({
      rest: {
        issues: {
          removeLabel: async () => {},
          addLabels: async () => {},
          createComment: async () => {},
        },
      },
    } as any);

    await sweepLeases(store, auth, (m) => log.push(m));
    
    const t = store.getTask("owner/repo", 1)!;
    expect(t.status).toBe("queued");
    expect(t.agent).toBe(config.agents[1 % config.agents.length]);
    expect(t.lease_expires_at).toBeNull();
    expect(t.reassign_count).toBe(1);
    expect(log.length).toBeGreaterThan(0);
  });

  it("requeues but does not reassign to a fighter when the coach's lease expires (M1-11)", async () => {
    const store = new Store(":memory:");
    store.upsertTask({ repo: "owner/repo", issue: 2, installation_id: 1, agent: config.managerName, status: "claimed" });
    store.updateTask("owner/repo", 2, { lease_expires_at: NOW - 1000 }); // expired

    const log: string[] = [];
    let removeLabelCalled = false;
    let addLabelsCalled = false;
    const auth = async () => ({
      rest: {
        issues: {
          removeLabel: async () => { removeLabelCalled = true; },
          addLabels: async () => { addLabelsCalled = true; },
          createComment: async () => {},
        },
      },
    } as any);

    await sweepLeases(store, auth, (m) => log.push(m));
    
    const t = store.getTask("owner/repo", 2)!;
    expect(t.status).toBe("queued");
    expect(t.agent).toBe(config.managerName); // Stays with coach
    expect(t.lease_expires_at).toBeNull();
    expect(t.reassign_count).toBe(0); // Did not reassign
    expect(removeLabelCalled).toBe(false);
    expect(addLabelsCalled).toBe(false);
  });
});
