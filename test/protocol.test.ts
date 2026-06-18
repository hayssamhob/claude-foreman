import { describe, expect, it } from "vitest";
import { parseMessage, serializeMessage, type AgentMessage } from "../src/protocol/messages.js";
import { parseTaskBranch, taskBranch } from "../src/protocol/labels.js";
import { extractJson } from "../src/manager/runner.js";

describe("mailbox messages", () => {
  const msg: AgentMessage = { v: 1, type: "claim", from: "antigravity", to: "manager", task: 42 };

  it("round-trips serialize/parse", () => {
    const body = serializeMessage(msg, "I am taking task #42.");
    expect(body).toContain("I am taking task #42.");
    expect(parseMessage(body)).toEqual(msg);
  });

  it("parses a header buried in a longer comment", () => {
    const body = `Some preamble\n\n${serializeMessage(msg, "text")}\n\ntrailing`;
    expect(parseMessage(body)?.task).toBe(42);
  });

  it("returns null for human comments and malformed headers", () => {
    expect(parseMessage("just a normal comment")).toBeNull();
    expect(parseMessage("<!-- agent-msg {not json} -->")).toBeNull();
    expect(parseMessage('<!-- agent-msg {"v":2,"type":"claim","task":1} -->')).toBeNull();
    expect(parseMessage(null)).toBeNull();
  });
});

describe("branch conventions", () => {
  it("round-trips branch names", () => {
    expect(parseTaskBranch(taskBranch("windsurf", 7))).toEqual({ agent: "windsurf", issue: 7 });
  });
  it("rejects non-agent branches", () => {
    expect(parseTaskBranch("feature/foo")).toBeNull();
    expect(parseTaskBranch("agent/windsurf/abc")).toBeNull();
  });
});

describe("manager output parsing", () => {
  it("parses bare JSON", () => {
    expect(extractJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });
  it("unwraps the Claude Code envelope", () => {
    const envelope = JSON.stringify({ type: "result", result: '{"verdict":"approve","summary":"ok","points":[]}' });
    expect(extractJson<{ verdict: string }>(envelope).verdict).toBe("approve");
  });
  it("strips code fences inside the envelope", () => {
    const envelope = JSON.stringify({ result: '```json\n{"tasks":[]}\n```' });
    expect(extractJson<{ tasks: unknown[] }>(envelope).tasks).toEqual([]);
  });
  it("salvages JSON surrounded by prose", () => {
    expect(extractJson<{ ok: boolean }>('Sure! Here it is: {"ok": true} Hope that helps.').ok).toBe(true);
  });
  it("handles code fences inside JSON string values", () => {
    const inner = { tasks: [{ spec: "Run this:\n```bash\nnpm test\n```\nthen done" }] };
    const envelope = JSON.stringify({ result: "```json\n" + JSON.stringify(inner) + "\n```" });
    expect(extractJson<typeof inner>(envelope)).toEqual(inner);
  });
});
