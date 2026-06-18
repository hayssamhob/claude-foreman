import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/state/db.js";

describe("Store", () => {
  let store: Store;
  beforeEach(() => {
    store = new Store(":memory:");
  });
  afterEach(() => store.close());

  const base = { repo: "o/r", issue: 1, installation_id: 99, agent: "windsurf", status: "queued" as const };

  it("upserts and reads tasks", () => {
    store.upsertTask(base);
    expect(store.getTask("o/r", 1)?.agent).toBe("windsurf");
    store.updateTask("o/r", 1, { status: "claimed", lease_expires_at: 123 });
    const t = store.getTask("o/r", 1)!;
    expect(t.status).toBe("claimed");
    expect(t.lease_expires_at).toBe(123);
  });

  it("finds expired leases only for held tasks", () => {
    store.upsertTask(base);
    store.updateTask("o/r", 1, { status: "claimed", lease_expires_at: Date.now() - 1000 });
    store.upsertTask({ ...base, issue: 2 });
    store.updateTask("o/r", 2, { status: "claimed", lease_expires_at: Date.now() + 60_000 });
    store.upsertTask({ ...base, issue: 3 }); // queued, no lease
    const expired = store.expiredLeases();
    expect(expired.map((t) => t.issue)).toEqual([1]);
  });

  it("deduplicates pending jobs (cron double-fire safety)", () => {
    const a = store.enqueueJob({ type: "review", repo: "o/r", installation_id: 99, issue: 1, pr: 5, head_sha: "abc" });
    const b = store.enqueueJob({ type: "review", repo: "o/r", installation_id: 99, issue: 1, pr: 5, head_sha: "abc" });
    expect(a).toBe(b);
    expect(store.nextJob()?.id).toBe(a);
    expect(store.nextJob()).toBeUndefined(); // claimed atomically, queue empty
  });

  it("records comments and returns the latest across issue and PR threads", () => {
    store.upsertTask(base);
    store.recordComment({ repo: "o/r", issue: 1, author: "manager[bot]", snippet: "assigned", msg_type: "assignment", msg_from: "manager", created_at: 100 });
    store.recordComment({ repo: "o/r", issue: 9, author: "hayssamhob", snippet: "pr chatter", created_at: 200 });
    expect(store.lastCommentFor("o/r", 1, null)?.snippet).toBe("assigned");
    expect(store.lastCommentFor("o/r", 1, 9)?.snippet).toBe("pr chatter"); // PR thread is newer
    expect(store.hasComments("o/r", 1)).toBe(true);
    expect(store.hasComments("o/r", 2)).toBe(false);
  });

  it("tracks revision points across rounds", () => {
    store.addRevisionPoints("o/r", 1, 1, ["fix the tests", "remove dead code"]);
    expect(store.openRevisionPoints("o/r", 1)).toHaveLength(2);
    const [first] = store.openRevisionPoints("o/r", 1);
    store.markPointsAddressed([first.id]);
    store.addRevisionPoints("o/r", 1, 2, ["update docs"]);
    const all = store.listRevisionPoints("o/r", 1);
    expect(all).toHaveLength(3);
    expect(all.filter((p) => p.status === "open")).toHaveLength(2);
    expect(all.find((p) => p.text === "fix the tests")?.status).toBe("addressed");
  });

  it("recovers jobs stranded in running state", () => {
    store.enqueueJob({ type: "decompose", repo: "o/r", installation_id: 99, issue: 1, pr: null, head_sha: null });
    expect(store.nextJob()).toBeDefined();
    expect(store.nextJob()).toBeUndefined();
    store.recoverStaleJobs();
    expect(store.nextJob()).toBeDefined();
  });
});
