import { describe, expect, it } from "vitest";
import { Store } from "../src/state/db.js";
import { renderHandoff } from "../src/handoff.js";
import { recordRateLimit } from "../src/agentlimits.js";

const NOOP = () => {};
const NOW = 1_700_000_000_000;
const REPOS = [{ fullName: "o/r", installationId: 1 }];

function seed(store: Store): void {
  store.upsertTask({ repo: "o/r", issue: 12, installation_id: 1, agent: "ollama", status: "queued", title: "Add login" });
  store.upsertTask({ repo: "o/r", issue: 14, installation_id: 1, agent: "claude", status: "in_review", title: "Fix nav", pr: 20 });
  store.upsertTask({ repo: "o/r", issue: 9, installation_id: 1, agent: "windsurf-kimi", status: "done", title: "Old work" });
  store.addRevisionPoints("o/r", 14, 1, ["use rem not px"]);
}

describe("handoff note storage", () => {
  it("returns the most recently saved note", () => {
    const store = new Store(":memory:");
    expect(store.latestHandoffNote()).toBeUndefined();
    store.saveHandoffNote("first", "owner");
    store.saveHandoffNote("second", "Claude");
    const latest = store.latestHandoffNote();
    expect(latest?.note).toBe("second");
    expect(latest?.author).toBe("Claude");
  });
});

describe("renderHandoff", () => {
  it("fuses the note, fleet snapshot, repos and resume steps into one block", () => {
    const store = new Store(":memory:");
    seed(store);
    store.saveHandoffNote("Mid dashboard redesign; next graft urgency rails.", "owner");
    const md = renderHandoff(store, REPOS, { now: NOW });

    expect(md).toContain("# 🔁 Resume bundle");
    expect(md).toContain("Mid dashboard redesign; next graft urgency rails.");
    expect(md).toContain("_— owner,"); // note attribution
    expect(md).toContain("https://github.com/o/r"); // managed repo
    expect(md).toContain('#14 "Fix nav"'); // active task line
    expect(md).toContain("https://github.com/o/r/pull/20"); // PR link
    expect(md).toContain("open fixes: use rem not px"); // revision point
    expect(md).toContain("## How to resume");
    // done/stopped tasks are summarised in counts, not listed in detail
    expect(md).not.toContain("Old work");
    expect(md).toContain("1 working · 1 queued · 0 approved · 0 needs you · 1 done");
  });

  it("shows per-provider availability, collapsing the shared Claude login", () => {
    const store = new Store(":memory:");
    seed(store);
    recordRateLimit(store, ["claude", "manager"], "session limit", NOW + 60 * 60_000, NOOP);
    const md = renderHandoff(store, REPOS, { now: NOW });

    expect(md).toContain("## Agent availability");
    expect(md).toMatch(/\*\*Claude\*\*: rate-limited/);
    expect(md).toMatch(/\*\*Ollama\*\*: available/);
  });

  it("prompts you to write a note when none is saved", () => {
    const store = new Store(":memory:");
    seed(store);
    const md = renderHandoff(store, REPOS, { now: NOW });
    expect(md).toContain("No handoff note saved");
  });
});
