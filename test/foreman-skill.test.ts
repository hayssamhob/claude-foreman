import { describe, it, expect } from "vitest";
import { parseCommand, canSteer, formatHelp, formatState, executeCommand, type LoopState } from "../src/skill/foreman-skill.js";

describe("parseCommand", () => {
  it("parses @foreman state", () => {
    const cmd = parseCommand("@foreman state");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("state");
  });

  it("parses @foreman status as state", () => {
    const cmd = parseCommand("@foreman status");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("state");
  });

  it("parses @foreman pause #42", () => {
    const cmd = parseCommand("@foreman pause #42");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("pause");
    expect(cmd!.issueNumber).toBe(42);
  });

  it("parses @foreman pause without issue number", () => {
    const cmd = parseCommand("@foreman pause");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("pause");
    expect(cmd!.issueNumber).toBeUndefined();
  });

  it("parses @foreman resume #42", () => {
    const cmd = parseCommand("@foreman resume #42");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("resume");
    expect(cmd!.issueNumber).toBe(42);
  });

  it("parses @foreman unpause as resume", () => {
    const cmd = parseCommand("@foreman unpause #10");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("resume");
    expect(cmd!.issueNumber).toBe(10);
  });

  it("parses @foreman redirect #42 to ollama", () => {
    const cmd = parseCommand("@foreman redirect #42 to ollama");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("redirect");
    expect(cmd!.issueNumber).toBe(42);
    expect(cmd!.agent).toBe("ollama");
  });

  it("parses @foreman retry #15", () => {
    const cmd = parseCommand("@foreman retry #15");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("retry");
    expect(cmd!.issueNumber).toBe(15);
  });

  it("parses @foreman help", () => {
    const cmd = parseCommand("@foreman help");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("help");
  });

  it("returns null for non-@foreman comments", () => {
    expect(parseCommand("just a regular comment")).toBeNull();
    expect(parseCommand("@otherbot do something")).toBeNull();
  });

  it("returns help for unknown commands", () => {
    const cmd = parseCommand("@foreman gibberish");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("help");
  });

  it("is case-insensitive", () => {
    const cmd = parseCommand("@Foreman PAUSE #5");
    expect(cmd).not.toBeNull();
    expect(cmd!.action).toBe("pause");
    expect(cmd!.issueNumber).toBe(5);
  });
});

describe("canSteer", () => {
  it("allows OWNER", () => expect(canSteer("OWNER")).toBe(true));
  it("allows MEMBER", () => expect(canSteer("MEMBER")).toBe(true));
  it("allows COLLABORATOR", () => expect(canSteer("COLLABORATOR")).toBe(true));
  it("rejects CONTRIBUTOR", () => expect(canSteer("CONTRIBUTOR")).toBe(false));
  it("rejects NONE", () => expect(canSteer("NONE")).toBe(false));
  it("is case-insensitive", () => expect(canSteer("owner")).toBe(true));
});

describe("formatHelp", () => {
  it("contains all commands", () => {
    const help = formatHelp();
    expect(help).toContain("state");
    expect(help).toContain("pause");
    expect(help).toContain("resume");
    expect(help).toContain("redirect");
    expect(help).toContain("retry");
    expect(help).toContain("help");
  });
});

describe("formatState", () => {
  it("formats the loop state as markdown", () => {
    const state: LoopState = {
      queued: 3, claimed: 1, inReview: 2, approved: 0, failed: 1, stopped: 0,
      activeAgents: ["ollama", "devin"], holdIssues: [42],
    };
    const formatted = formatState(state);
    expect(formatted).toContain("Queued");
    expect(formatted).toContain("3");
    expect(formatted).toContain("ollama");
    expect(formatted).toContain("#42");
  });
});

describe("executeCommand", () => {
  it("rejects non-authorized users", () => {
    const result = executeCommand({ action: "pause", raw: "pause" }, { canSteer: false });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("OWNER");
  });

  it("executes pause with issue number", () => {
    const result = executeCommand({ action: "pause", issueNumber: 42, raw: "pause #42" }, { canSteer: true });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("#42");
    expect(result.message).toContain("hold");
  });

  it("executes pause without issue number (all)", () => {
    const result = executeCommand({ action: "pause", raw: "pause" }, { canSteer: true });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("all");
  });

  it("executes redirect with issue and agent", () => {
    const result = executeCommand({ action: "redirect", issueNumber: 10, agent: "ollama", raw: "redirect #10 to ollama" }, { canSteer: true });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("#10");
    expect(result.message).toContain("ollama");
  });

  it("rejects redirect without issue number", () => {
    const result = executeCommand({ action: "redirect", agent: "ollama", raw: "redirect to ollama" }, { canSteer: true });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Usage");
  });

  it("rejects redirect without agent", () => {
    const result = executeCommand({ action: "redirect", issueNumber: 10, raw: "redirect #10" }, { canSteer: true });
    expect(result.ok).toBe(false);
  });

  it("executes state with a state snapshot", () => {
    const state: LoopState = { queued: 1, claimed: 0, inReview: 0, approved: 0, failed: 0, stopped: 0, activeAgents: [], holdIssues: [] };
    const result = executeCommand({ action: "state", raw: "state" }, { canSteer: true, state });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Loop State");
  });

  it("rejects state without a state snapshot", () => {
    const result = executeCommand({ action: "state", raw: "state" }, { canSteer: true });
    expect(result.ok).toBe(false);
  });

  it("executes help", () => {
    const result = executeCommand({ action: "help", raw: "help" }, { canSteer: true });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("commands");
  });
});
