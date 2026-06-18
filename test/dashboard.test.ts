import { describe, expect, it } from "vitest";
import { pickupVerdict } from "../src/dashboard.js";
import type { CommentRow, TaskRow } from "../src/state/db.js";

const NOW = 1_000_000_000_000;
const MIN = 60_000;

function task(overrides: Partial<TaskRow>): TaskRow {
  return {
    repo: "o/r",
    issue: 1,
    installation_id: 1,
    agent: "antigravity",
    status: "queued",
    title: "t",
    plain_summary: null,
    pr: null,
    lease_expires_at: null,
    stale_warned_at: null,
    revision_round: 0,
    reassign_count: 0,
    created_at: NOW - 60 * MIN,
    updated_at: NOW - 60 * MIN,
    ...overrides,
  };
}

describe("pickupVerdict", () => {
  it("warns when a queued task sits past the grace period", () => {
    expect(pickupVerdict(task({ updated_at: NOW - 30 * MIN }), undefined, NOW)).toMatch(/hasn't picked this up/);
  });

  it("stays quiet for freshly queued tasks", () => {
    expect(pickupVerdict(task({ updated_at: NOW - 5 * MIN }), undefined, NOW)).toBeNull();
  });

  it("stays quiet once the task is claimed", () => {
    expect(pickupVerdict(task({ status: "claimed", updated_at: NOW - 120 * MIN }), undefined, NOW)).toBeNull();
  });

  it("warns when a revision request has gone unanswered", () => {
    const last: CommentRow = {
      repo: "o/r",
      issue: 1,
      author: "agent-manager[bot]",
      snippet: "fix things",
      msg_type: "revision-request",
      msg_from: "manager",
      created_at: NOW - 45 * MIN,
    };
    expect(pickupVerdict(task({ status: "changes_requested" }), last, NOW)).toMatch(/hasn't responded/);
  });

  it("stays quiet when the agent replied after the revision request", () => {
    const last: CommentRow = {
      repo: "o/r",
      issue: 1,
      author: "hayssamhob",
      snippet: "on it",
      msg_type: "progress",
      msg_from: "antigravity",
      created_at: NOW - 5 * MIN,
    };
    expect(pickupVerdict(task({ status: "changes_requested" }), last, NOW)).toBeNull();
  });
});
