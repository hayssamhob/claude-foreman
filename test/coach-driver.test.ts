/**
 * Coach-driver conformance test (M5-9).
 *
 * Runs each CoachDriver adapter against a fixture/stub — no real CLI calls,
 * no network. `spawn` is mocked to return a fake child process that emits
 * the fixture JSON on stdout. `runManager` is mocked for the Claude adapter
 * (which delegates to the existing runner). Asserts the structured verdict
 * shape: { verdict: "approve" | "request-changes", ... }.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// ── fixtures ─────────────────────────────────────────────────────────────────

const APPROVE_VERDICT = {
  verdict: "approve" as const,
  summary: "Looks good.",
  plainSummary: "The change works.",
  points: [] as string[],
};

const REQUEST_CHANGES_VERDICT = {
  verdict: "request-changes" as const,
  summary: "Needs a fix.",
  plainSummary: "Something is broken.",
  points: ["Fix the typo on line 3."],
};

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a fake child process that emits `payload` on stdout then closes cleanly. */
function makeFakeChild(payload: string) {
  const stdin = new EventEmitter() as EventEmitter & { write: (d: string) => void; end: () => void };
  stdin.write = () => {};
  stdin.end = () => {};
  const stdout = new EventEmitter() as EventEmitter & { setEncoding: (e: string) => void };
  stdout.setEncoding = () => {};
  const stderr = new EventEmitter() as EventEmitter & { setEncoding: (e: string) => void };
  stderr.setEncoding = () => {};
  const child = new EventEmitter() as EventEmitter & {
    stdin: typeof stdin;
    stdout: typeof stdout;
    stderr: typeof stderr;
  };
  child.stdin = stdin;
  child.stdout = stdout;
  child.stderr = stderr;

  // Emit data + close asynchronously so the Promise in the adapter can settle
  setImmediate(() => {
    stdout.emit("data", Buffer.from(payload));
    child.emit("close", 0);
  });
  return child;
}

// ── config mock (shared) ──────────────────────────────────────────────────────

vi.mock("../src/config.js", () => ({
  config: {
    managerCmd: "echo-stub",
    managerDisabled: false,
    coachDriver: "claude",
  },
}));

// ── Claude adapter ────────────────────────────────────────────────────────────

vi.mock("../src/manager/runner.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/manager/runner.js")>();
  return {
    ...actual,
    runManager: vi.fn(),
  };
});

import { runManager } from "../src/manager/runner.js";
import { createClaudeCoachDriver } from "../src/drivers/coach-claude.js";

describe("ClaudeCoachDriver conformance", () => {
  const driver = createClaudeCoachDriver({ log: () => {} });

  it("has name coach-claude", () => {
    expect(driver.name).toBe("coach-claude");
  });

  it("delegates to runManager and returns approve verdict", async () => {
    vi.mocked(runManager).mockResolvedValueOnce(APPROVE_VERDICT);
    const result = await driver.run<typeof APPROVE_VERDICT>("a prompt");
    expect(result.verdict).toBe("approve");
    expect(result.points).toEqual([]);
  });

  it("delegates to runManager and returns request-changes verdict", async () => {
    vi.mocked(runManager).mockResolvedValueOnce(REQUEST_CHANGES_VERDICT);
    const result = await driver.run<typeof REQUEST_CHANGES_VERDICT>("another prompt");
    expect(result.verdict).toBe("request-changes");
    expect(result.points.length).toBeGreaterThan(0);
  });
});

// ── Codex adapter ─────────────────────────────────────────────────────────────

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { createCodexCoachDriver } from "../src/drivers/coach-codex.js";

describe("CodexCoachDriver conformance", () => {
  const driver = createCodexCoachDriver({ log: () => {} });

  beforeEach(() => {
    vi.mocked(spawn).mockClear();
  });

  it("has name coach-codex", () => {
    expect(driver.name).toBe("coach-codex");
  });

  it("parses approve verdict from plain-text stdout", async () => {
    vi.mocked(spawn).mockReturnValueOnce(
      makeFakeChild(JSON.stringify(APPROVE_VERDICT)) as ReturnType<typeof spawn>
    );
    const result = await driver.run<typeof APPROVE_VERDICT>("a prompt");
    expect(result.verdict).toBe("approve");
    expect(result.points).toEqual([]);
  });

  it("parses request-changes verdict from plain-text stdout", async () => {
    vi.mocked(spawn).mockReturnValueOnce(
      makeFakeChild(JSON.stringify(REQUEST_CHANGES_VERDICT)) as ReturnType<typeof spawn>
    );
    const result = await driver.run<typeof REQUEST_CHANGES_VERDICT>("a prompt");
    expect(result.verdict).toBe("request-changes");
    expect(result.points.length).toBeGreaterThan(0);
  });

  it("parses verdict from fenced JSON in stdout", async () => {
    const fenced = "Here is the verdict:\n```json\n" + JSON.stringify(APPROVE_VERDICT) + "\n```";
    vi.mocked(spawn).mockReturnValueOnce(
      makeFakeChild(fenced) as ReturnType<typeof spawn>
    );
    const result = await driver.run<typeof APPROVE_VERDICT>("a prompt");
    expect(result.verdict).toBe("approve");
  });

  it("rejects when codex exits non-zero", async () => {
    // Override close to exit with code 1
    const stdin = new EventEmitter() as EventEmitter & { write: () => void; end: () => void };
    stdin.write = () => {};
    stdin.end = () => {};
    const badChild = Object.assign(new EventEmitter(), {
      stdin,
      stdout: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
      stderr: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
    });
    setImmediate(() => badChild.emit("close", 1));
    vi.mocked(spawn).mockReturnValueOnce(badChild as unknown as ReturnType<typeof spawn>);
    await expect(driver.run<unknown>("bad prompt")).rejects.toThrow(/codex exited/);
  });
});

// ── Gemini adapter ────────────────────────────────────────────────────────────

import { createGeminiCoachDriver } from "../src/drivers/coach-gemini.js";

describe("GeminiCoachDriver conformance", () => {
  const driver = createGeminiCoachDriver({ log: () => {} });

  beforeEach(() => {
    vi.mocked(spawn).mockClear();
  });

  it("has name coach-gemini", () => {
    expect(driver.name).toBe("coach-gemini");
  });

  it("parses approve verdict from plain-text stdout", async () => {
    vi.mocked(spawn).mockReturnValueOnce(
      makeFakeChild(JSON.stringify(APPROVE_VERDICT)) as ReturnType<typeof spawn>
    );
    const result = await driver.run<typeof APPROVE_VERDICT>("a prompt");
    expect(result.verdict).toBe("approve");
    expect(result.points).toEqual([]);
  });

  it("parses request-changes verdict from plain-text stdout", async () => {
    vi.mocked(spawn).mockReturnValueOnce(
      makeFakeChild(JSON.stringify(REQUEST_CHANGES_VERDICT)) as ReturnType<typeof spawn>
    );
    const result = await driver.run<typeof REQUEST_CHANGES_VERDICT>("a prompt");
    expect(result.verdict).toBe("request-changes");
    expect(result.points.length).toBeGreaterThan(0);
  });

  it("parses verdict from fenced JSON in stdout", async () => {
    const fenced = "Here is the verdict:\n```json\n" + JSON.stringify(APPROVE_VERDICT) + "\n```";
    vi.mocked(spawn).mockReturnValueOnce(
      makeFakeChild(fenced) as ReturnType<typeof spawn>
    );
    const result = await driver.run<typeof APPROVE_VERDICT>("a prompt");
    expect(result.verdict).toBe("approve");
  });

  it("rejects when gemini exits non-zero", async () => {
    const stdin2 = new EventEmitter() as EventEmitter & { write: () => void; end: () => void };
    stdin2.write = () => {};
    stdin2.end = () => {};
    const badChild = Object.assign(new EventEmitter(), {
      stdin: stdin2,
      stdout: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
      stderr: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
    });
    setImmediate(() => badChild.emit("close", 1));
    vi.mocked(spawn).mockReturnValueOnce(badChild as unknown as ReturnType<typeof spawn>);
    await expect(driver.run<unknown>("bad prompt")).rejects.toThrow(/gemini exited/);
  });
});

// ── config.coachDriver selection ──────────────────────────────────────────────

describe("config.coachDriver selection", () => {
  it("defaults to claude", async () => {
    const { config } = await import("../src/config.js");
    expect(config.coachDriver).toBe("claude");
  });
});
