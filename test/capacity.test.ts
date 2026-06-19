import { describe, it, expect } from "vitest";
import { computeLoad } from "../src/dispatch/capacity.js";

const NOW = 1_000_000_000_000;
const H = 3_600_000;

describe("computeLoad", () => {
  it("returns zero active and empty stale for no assigned issues", () => {
    const r = computeLoad({ agent: "ollama", assignedIssues: [], openPrIssues: [], branchedIssues: [], now: NOW, assignedAtByIssue: {} });
    expect(r.activeIssues).toBe(0);
    expect(r.staleAssignments).toEqual([]);
  });

  it("counts an issue with an open PR as active", () => {
    const r = computeLoad({ agent: "ollama", assignedIssues: [1], openPrIssues: [1], branchedIssues: [], now: NOW, assignedAtByIssue: { 1: NOW - 10 * H } });
    expect(r.activeIssues).toBe(1);
    expect(r.staleAssignments).toEqual([]);
  });

  it("counts an issue with a remote branch as active", () => {
    const r = computeLoad({ agent: "ollama", assignedIssues: [2], openPrIssues: [], branchedIssues: [2], now: NOW, assignedAtByIssue: { 2: NOW - 10 * H } });
    expect(r.activeIssues).toBe(1);
    expect(r.staleAssignments).toEqual([]);
  });

  it("fresh label-only assignment is NOT stale", () => {
    const r = computeLoad({ agent: "ollama", assignedIssues: [3], openPrIssues: [], branchedIssues: [], now: NOW, assignedAtByIssue: { 3: NOW - 2 * H }, staleHours: 6 });
    expect(r.staleAssignments).toEqual([]);
    expect(r.activeIssues).toBe(0);
  });

  it("old label-only assignment IS stale", () => {
    const r = computeLoad({ agent: "ollama", assignedIssues: [4], openPrIssues: [], branchedIssues: [], now: NOW, assignedAtByIssue: { 4: NOW - 8 * H }, staleHours: 6 });
    expect(r.staleAssignments).toEqual([4]);
    expect(r.activeIssues).toBe(0);
  });

  it("active issue (has PR) is never stale even if very old", () => {
    const r = computeLoad({ agent: "devin", assignedIssues: [5], openPrIssues: [5], branchedIssues: [], now: NOW, assignedAtByIssue: { 5: NOW - 100 * H }, staleHours: 6 });
    expect(r.staleAssignments).toEqual([]);
    expect(r.activeIssues).toBe(1);
  });

  it("mixed: one active, one stale, one fresh", () => {
    const r = computeLoad({
      agent: "devin",
      assignedIssues: [10, 11, 12],
      openPrIssues: [10],
      branchedIssues: [],
      now: NOW,
      assignedAtByIssue: { 10: NOW - 10 * H, 11: NOW - 10 * H, 12: NOW - 2 * H },
      staleHours: 6,
    });
    expect(r.activeIssues).toBe(1);
    expect(r.staleAssignments).toEqual([11]); // 12 is fresh → not stale
  });
});
