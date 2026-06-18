import { describe, expect, it } from "vitest";
import { mergeGate } from "../src/automerge.js";
import type { CiState } from "../src/threads.js";

const green: CiState = { overall: "green", detail: "3 checks passed" };
const none: CiState = { overall: "none", detail: "no automated checks set up" };

describe("mergeGate", () => {
  it("merges when everything is green", () => {
    expect(mergeGate({ ci: green, openThreads: 0, held: false, mergeable: true }).ok).toBe(true);
  });

  it("merges when the repo has no CI at all", () => {
    expect(mergeGate({ ci: none, openThreads: 0, held: false, mergeable: true }).ok).toBe(true);
  });

  it("waits on the hold label, even with everything green", () => {
    const g = mergeGate({ ci: green, openThreads: 0, held: true, mergeable: true });
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("hold");
  });

  it("waits on failing tests", () => {
    const g = mergeGate({
      ci: { overall: "red", detail: "unit-tests" },
      openThreads: 0,
      held: false,
      mergeable: true,
    });
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("failing");
  });

  it("waits on running tests", () => {
    const g = mergeGate({
      ci: { overall: "pending", detail: "build" },
      openThreads: 0,
      held: false,
      mergeable: true,
    });
    expect(g.ok).toBe(false);
  });

  it("waits on unresolved conversations", () => {
    const g = mergeGate({ ci: green, openThreads: 2, held: false, mergeable: true });
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("2");
  });

  it("waits on merge conflicts and on unknown mergeability", () => {
    expect(mergeGate({ ci: green, openThreads: 0, held: false, mergeable: false }).ok).toBe(false);
    expect(mergeGate({ ci: green, openThreads: 0, held: false, mergeable: null }).ok).toBe(false);
  });
});
