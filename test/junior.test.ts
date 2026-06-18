import { describe, expect, it } from "vitest";
import { revisionPrompt, workPrompt } from "../src/junior/prompts.js";
import { workspaceDir } from "../src/junior/git.js";
import type { ThreadSummary } from "../src/threads.js";

describe("junior prompts", () => {
  it("workPrompt carries the spec, branch, and forbids git", () => {
    const p = workPrompt({
      repoFull: "o/r",
      issue: 7,
      title: "Add a contact form",
      spec: "Acceptance: form posts to /contact",
      branch: "agent/claude/7",
    });
    expect(p).toContain("TASK #7: Add a contact form");
    expect(p).toContain("agent/claude/7");
    expect(p).toContain("Acceptance: form posts to /contact");
    expect(p).toContain("Do NOT use git");
    expect(p).toContain('"prTitle"');
  });

  it("revisionPrompt numbers points and open conversations", () => {
    const thread: ThreadSummary = {
      id: "T_1",
      path: "src/app.ts",
      firstAuthor: "hayssamhob",
      firstSnippet: "this leaks the token",
      lastAuthor: "hayssamhob",
      lastAt: 0,
      replies: 0,
      waitingOn: "agent",
      fixCommit: null,
    };
    const p = revisionPrompt({
      repoFull: "o/r",
      issue: 7,
      branch: "agent/claude/7",
      round: 2,
      points: ["Fix the null check", "Add a test"],
      threads: [thread],
    });
    expect(p).toContain("1. Fix the null check");
    expect(p).toContain("2. Add a test");
    expect(p).toContain("revision round 2");
    expect(p).toContain('[src/app.ts] "this leaks the token"');
    expect(p).toContain('"threadReplies"');
  });
});

describe("workspaceDir", () => {
  it("maps owner/repo to a single folder name", () => {
    expect(workspaceDir("hayssamhob/agent-manager-sandbox")).toMatch(/hayssamhob__agent-manager-sandbox$/);
  });
});
