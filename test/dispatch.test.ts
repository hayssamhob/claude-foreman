import { describe, it, expect } from "vitest";
import { parseAgent, slugify, branchFor, noopAdapter } from "../src/dispatch/adapter.js";
import { buildDevinPrompt, devinAdapter } from "../src/dispatch/devin.js";
import { buildOllamaPrompt, safePath, ollamaAdapter } from "../src/dispatch/ollama.js";
import { buildCursorPrompt, cursorAdapter } from "../src/dispatch/cursor.js";
import { isExcludedScope } from "../src/dispatch/adapter.js";
import { buildDevinLocalPrompt, devinLocalAdapter } from "../src/dispatch/devin-local.js";

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

describe("buildCursorPrompt", () => {
  const ctx = { repo: "o/r", issueNumber: 89, agent: "cursor", brief: "Implement the widget.", branch: "feat/issue-89-cursor" };
  it("embeds the brief", () => expect(buildCursorPrompt(ctx)).toContain("Implement the widget."));
  it("restricts to file edits only", () => expect(buildCursorPrompt(ctx)).toMatch(/do not.*branch|only modify/i));
  it("carries the exclusion guardrail", () => expect(buildCursorPrompt(ctx)).toMatch(/auth|payment|secret/i));
  it("references the issue number", () => expect(buildCursorPrompt(ctx)).toContain("#89"));
});

describe("isExcludedScope", () => {
  it("matches auth", () => expect(isExcludedScope("harden the auth flow")).toBeTruthy());
  it("matches payment", () => expect(isExcludedScope("add payment processing")).toBeTruthy());
  it("does not match safe briefs", () => expect(isExcludedScope("add a help text tooltip")).toBeNull());
});

describe("cursorAdapter", () => {
  it("has name cursor", () => expect(cursorAdapter.name).toBe("cursor"));
  it("returns dry-run when CURSOR_API_KEY absent", async () => {
    const saved = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    const r = await cursorAdapter.wake({ repo: "o/r", issueNumber: 89, agent: "cursor", brief: "Build a widget.", branch: "b" });
    expect(r.status).toBe("dry-run");
    if (saved !== undefined) process.env.CURSOR_API_KEY = saved;
  });
  it("skips excluded scope even with a key", async () => {
    const saved = process.env.CURSOR_API_KEY;
    process.env.CURSOR_API_KEY = "fake-key";
    const r = await cursorAdapter.wake({ repo: "o/r", issueNumber: 89, agent: "cursor", brief: "Harden auth tokens.", branch: "b" });
    expect(r.status).toBe("skipped");
    if (saved !== undefined) process.env.CURSOR_API_KEY = saved;
    else delete process.env.CURSOR_API_KEY;
  });
});

describe("buildDevinLocalPrompt", () => {
  const ctx = { repo: "o/r", issueNumber: 89, agent: "devin-local", brief: "Add the widget.", branch: "feat/issue-89-devin" };
  it("embeds the grilled brief", () => expect(buildDevinLocalPrompt(ctx)).toContain("Add the widget."));
  it("instructs Closes #N", () => expect(buildDevinLocalPrompt(ctx)).toContain("Closes #89"));
  it("instructs the done-signal", () => expect(buildDevinLocalPrompt(ctx)).toContain("✅ #89 done"));
  it("names the repo and branch", () => {
    const p = buildDevinLocalPrompt(ctx);
    expect(p).toContain("o/r");
    expect(p).toContain("feat/issue-89-devin");
  });
  it("carries the exclusion guardrail", () => expect(buildDevinLocalPrompt(ctx)).toMatch(/auth|secrets|migrations/i));
});

describe("devinLocalAdapter", () => {
  it("has name devin-local", () => expect(devinLocalAdapter.name).toBe("devin-local"));
  it("returns dry-run when devin binary absent", async () => {
    const savedPath = process.env.PATH;
    process.env.PATH = "/dev/null"; // garantit que execFileSync("devin") échoue
    try {
      const r = await devinLocalAdapter.wake({ repo: "o/r", issueNumber: 89, agent: "devin-local", brief: "x", branch: "b" });
      expect(r.status).toBe("dry-run");
    } finally {
      process.env.PATH = savedPath;
    }
  });
});

describe("noopAdapter", () => {
  it("acks without side effects", async () => {
    const r = await noopAdapter.wake({ repo: "o/r", issueNumber: 7, agent: "noop", brief: "", branch: "b" });
    expect(r.status).toBe("skipped");
    expect(r.detail).toContain("#7");
  });
});
