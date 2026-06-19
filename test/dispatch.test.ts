import { describe, it, expect } from "vitest";
import { parseAgent, slugify, branchFor, noopAdapter } from "../src/dispatch/adapter.js";
import { buildDevinPrompt, devinAdapter } from "../src/dispatch/devin.js";
import { buildOllamaPrompt, safePath, ollamaAdapter } from "../src/dispatch/ollama.js";

describe("parseAgent", () => {
  it("extracts the agent name", () => expect(parseAgent("agent:devin")).toBe("devin"));
  it("lowercases", () => expect(parseAgent("agent:Devin")).toBe("devin"));
  it("returns null for non-agent labels", () => expect(parseAgent("priority:high")).toBeNull());
  it("returns null for the bare prefix", () => expect(parseAgent("agent:")).toBeNull());
});

describe("slugify / branchFor", () => {
  it("builds a feat branch from an issue title", () => {
    expect(branchFor(40, "Harden the App auth (remove tokens from remote URLs)")).toBe(
      "feat/issue-40-harden-the-app"
    );
  });
  it("falls back to 'task' for empty titles", () => {
    expect(slugify("()!!")).toBe("task");
  });
});

describe("buildDevinPrompt", () => {
  const ctx = { repo: "o/r", issueNumber: 40, agent: "devin", brief: "Implement the thing.", branch: "feat/issue-40-x" };
  it("embeds the grilled brief", () => expect(buildDevinPrompt(ctx)).toContain("Implement the thing."));
  it("instructs Closes #N", () => expect(buildDevinPrompt(ctx)).toContain("Closes #40"));
  it("instructs the done-signal", () => expect(buildDevinPrompt(ctx)).toContain("✅ #40 done"));
  it("names the repo and branch", () => {
    const p = buildDevinPrompt(ctx);
    expect(p).toContain("o/r");
    expect(p).toContain("feat/issue-40-x");
  });
  it("carries the exclusion-list guardrail", () => expect(buildDevinPrompt(ctx)).toMatch(/auth|secrets|migrations/i));
});

describe("devinAdapter dry-run (no network without creds)", () => {
  it("returns dry-run when the key is absent", async () => {
    const k = process.env.DEVIN_API_KEY;
    const o = process.env.DEVIN_ORG_ID;
    delete process.env.DEVIN_API_KEY;
    delete process.env.DEVIN_ORG_ID;
    const r = await devinAdapter.wake({ repo: "o/r", issueNumber: 1, agent: "devin", brief: "x", branch: "b" });
    expect(r.status).toBe("dry-run");
    if (k) process.env.DEVIN_API_KEY = k;
    if (o) process.env.DEVIN_ORG_ID = o;
  });
});

describe("safePath", () => {
  it("allows a valid relative path", () => expect(safePath("/repo", "src/foo.ts")).toBe("/repo/src/foo.ts"));
  it("rejects absolute path", () => expect(safePath("/repo", "/etc/passwd")).toBeNull());
  it("rejects traversal", () => expect(safePath("/repo", "../outside")).toBeNull());
  it("rejects dot-dot in middle", () => expect(safePath("/repo", "src/../../../etc")).toBeNull());
});

describe("buildOllamaPrompt", () => {
  const ctx = { repo: "o/r", issueNumber: 88, agent: "ollama", brief: "Do the thing.", branch: "feat/issue-88-x" };
  it("embeds the brief", () => expect(buildOllamaPrompt(ctx)).toContain("Do the thing."));
  it("requests JSON files output", () => expect(buildOllamaPrompt(ctx)).toContain('"files"'));
});

describe("ollamaAdapter dry-run (unreachable Ollama)", () => {
  it("returns dry-run when Ollama is unreachable", async () => {
    const origUrl = process.env.OLLAMA_URL;
    process.env.OLLAMA_URL = "http://localhost:19999/api/generate"; // nothing listening
    const r = await ollamaAdapter.wake({ repo: "o/r", issueNumber: 88, agent: "ollama", brief: "x", branch: "b" });
    expect(r.status).toBe("dry-run");
    if (origUrl !== undefined) process.env.OLLAMA_URL = origUrl;
    else delete process.env.OLLAMA_URL;
  });
});

describe("noopAdapter", () => {
  it("acks without side effects", async () => {
    const r = await noopAdapter.wake({ repo: "o/r", issueNumber: 7, agent: "noop", brief: "", branch: "b" });
    expect(r.status).toBe("skipped");
    expect(r.detail).toContain("#7");
  });
});
