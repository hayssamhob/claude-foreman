import { describe, it, expect, vi } from "vitest";
import { buildTaskBody } from "../src/manager/worker.js";

// Mock config to ensure stable test environment
vi.mock("../src/config.js", () => ({
  config: {
    managerName: "fable",
  },
}));

describe("buildTaskBody", () => {
  const spec = "Do the work";
  const agent = "antigravity";
  const epic = 13;
  const repo = "hayssamhob/claude-foreman";
  const taskIssue = 42;

  it("omits the done-contract section when doneContract array is empty", () => {
    const output = buildTaskBody(spec, agent, epic, repo, taskIssue, []);
    expect(output).not.toContain("## Done-contract");
    expect(output).toContain(spec);
    expect(output).toContain("Parent epic: #13");
  });

  it("includes the done-contract section when doneContract array has items", () => {
    const contracts = ["npm test exits 0", "closes #42 present in PR body"];
    const output = buildTaskBody(spec, agent, epic, repo, taskIssue, contracts);
    
    expect(output).toContain("## Done-contract");
    expect(output).toContain("1. npm test exits 0");
    expect(output).toContain("2. closes #42 present in PR body");
    expect(output).toContain(spec);
    expect(output).toContain("Parent epic: #13");
  });
});
