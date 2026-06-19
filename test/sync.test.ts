import { describe, it, expect, vi, beforeEach } from "vitest";
import { recoverFromCrash, type RecoveryReport } from "../src/state/sync.js";
import type { Store } from "../src/state/db.js";
import type { TaskRow } from "../src/state/db.js";

// Mock Store — we only test the pure recovery logic, not the GitHub rebuild
function makeMockStore(tasks: TaskRow[]): Store {
  const updates: any[] = [];
  return {
    listTasks: () => tasks,
    updateTask: (repo: string, issue: number, fields: any) => updates.push({ repo, issue, ...fields }),
    _updates: updates,
  } as any;
}

describe("recoverFromCrash", () => {
  it("resets stale claimed tasks whose lease has expired", () => {
    const now = Date.now();
    const tasks: TaskRow[] = [
      {
        repo: "o/r", issue: 1, installation_id: 1, agent: "devin", status: "claimed",
        title: null, plain_summary: null, pr: null, lease_expires_at: now - 1000,
        stale_warned_at: null, revision_round: 0, reassign_count: 0,
        created_at: now, updated_at: now,
      },
    ];
    const store = makeMockStore(tasks);
    const report = recoverFromCrash(store, now);
    expect(report.staleTasksReset).toBe(1);
    expect((store as any)._updates).toHaveLength(1);
    expect((store as any)._updates[0].status).toBe("queued");
    expect((store as any)._updates[0].lease_expires_at).toBeNull();
    expect((store as any)._updates[0].stale_warned_at).toBeNull();
  });

  it("does not reset claimed tasks whose lease is still valid", () => {
    const now = Date.now();
    const tasks: TaskRow[] = [
      {
        repo: "o/r", issue: 1, installation_id: 1, agent: "devin", status: "claimed",
        title: null, plain_summary: null, pr: null, lease_expires_at: now + 60_000,
        stale_warned_at: null, revision_round: 0, reassign_count: 0,
        created_at: now, updated_at: now,
      },
    ];
    const store = makeMockStore(tasks);
    const report = recoverFromCrash(store, now);
    expect(report.staleTasksReset).toBe(0);
  });

  it("does not reset tasks in other statuses", () => {
    const now = Date.now();
    const tasks: TaskRow[] = [
      {
        repo: "o/r", issue: 1, installation_id: 1, agent: "devin", status: "in_review",
        title: null, plain_summary: null, pr: null, lease_expires_at: now - 1000,
        stale_warned_at: null, revision_round: 0, reassign_count: 0,
        created_at: now, updated_at: now,
      },
      {
        repo: "o/r", issue: 2, installation_id: 1, agent: "devin", status: "queued",
        title: null, plain_summary: null, pr: null, lease_expires_at: null,
        stale_warned_at: null, revision_round: 0, reassign_count: 0,
        created_at: now, updated_at: now,
      },
    ];
    const store = makeMockStore(tasks);
    const report = recoverFromCrash(store, now);
    expect(report.staleTasksReset).toBe(0);
  });

  it("resets claimed tasks with null lease (safety — treat as expired)", () => {
    const now = Date.now();
    const tasks: TaskRow[] = [
      {
        repo: "o/r", issue: 1, installation_id: 1, agent: "devin", status: "claimed",
        title: null, plain_summary: null, pr: null, lease_expires_at: null,
        stale_warned_at: null, revision_round: 0, reassign_count: 0,
        created_at: now, updated_at: now,
      },
    ];
    const store = makeMockStore(tasks);
    const report = recoverFromCrash(store, now);
    // null lease — we DON'T reset (no lease means no timeout)
    expect(report.staleTasksReset).toBe(0);
  });

  it("handles empty task list", () => {
    const store = makeMockStore([]);
    const report = recoverFromCrash(store);
    expect(report.staleTasksReset).toBe(0);
    expect(report.orphanedTasksCleared).toBe(0);
  });

  it("resets multiple stale tasks", () => {
    const now = Date.now();
    const tasks: TaskRow[] = [
      {
        repo: "o/r", issue: 1, installation_id: 1, agent: "devin", status: "claimed",
        title: null, plain_summary: null, pr: null, lease_expires_at: now - 1000,
        stale_warned_at: null, revision_round: 0, reassign_count: 0,
        created_at: now, updated_at: now,
      },
      {
        repo: "o/r", issue: 2, installation_id: 1, agent: "kimi", status: "claimed",
        title: null, plain_summary: null, pr: null, lease_expires_at: now - 2000,
        stale_warned_at: null, revision_round: 0, reassign_count: 0,
        created_at: now, updated_at: now,
      },
    ];
    const store = makeMockStore(tasks);
    const report = recoverFromCrash(store, now);
    expect(report.staleTasksReset).toBe(2);
  });

  it("returns a report with all fields", () => {
    const store = makeMockStore([]);
    const report = recoverFromCrash(store);
    expect(report).toHaveProperty("staleJobsReset");
    expect(report).toHaveProperty("staleTasksReset");
    expect(report).toHaveProperty("orphanedTasksCleared");
  });
});
