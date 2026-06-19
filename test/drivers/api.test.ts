import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApiPrompt, safePath, createApiAdapter } from "../../src/drivers/api.js";
import type { WakeContext } from "../../src/dispatch/adapter.js";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

// Mock child_process and fs
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => "https://github.com/owner/repo/pull/999"),
}));
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const ctx: WakeContext = {
  repo: "owner/repo",
  issueNumber: 49,
  agent: "api",
  brief: "Add a hello world function in src/hello.ts",
  branch: "feat/issue-49-hello-world",
};

describe("buildApiPrompt", () => {
  it("includes the brief and JSON output contract", () => {
    const prompt = buildApiPrompt(ctx);
    expect(prompt).toContain("Add a hello world function");
    expect(prompt).toContain('"files"');
    expect(prompt).toContain("valid JSON");
  });
});

describe("safePath", () => {
  it("allows relative paths inside repo root", () => {
    expect(safePath("/repo", "src/hello.ts")).toBe("/repo/src/hello.ts");
  });

  it("rejects absolute paths", () => {
    expect(safePath("/repo", "/etc/passwd")).toBeNull();
  });

  it("rejects path traversal", () => {
    expect(safePath("/repo", "../etc/passwd")).toBeNull();
  });

  it("rejects empty paths", () => {
    expect(safePath("/repo", "")).toBeNull();
  });
});

describe("createApiAdapter", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(execFileSync).mockClear();
    vi.mocked(mkdirSync).mockClear();
    vi.mocked(writeFileSync).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns dry-run when API_KEY is not set", async () => {
    const adapter = createApiAdapter(undefined, "https://api.test.com", "test-model");
    const result = await adapter.wake(ctx);
    expect(result.status).toBe("dry-run");
    expect(result.detail).toContain("API_KEY not set");
  });

  it("returns dry-run when API is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const adapter = createApiAdapter("test-key", "https://api.test.com", "test-model");
    const result = await adapter.wake(ctx);
    expect(result.status).toBe("dry-run");
    expect(result.detail).toContain("API unreachable");
  });

  it("returns skipped for excluded scope", async () => {
    const excludedCtx = { ...ctx, brief: "Add a payment secrets migration" };
    const adapter = createApiAdapter("test-key", "https://api.test.com", "test-model");
    const result = await adapter.wake(excludedCtx);
    expect(result.status).toBe("skipped");
    expect(result.detail).toContain("excluded scope");
  });

  it("calls the OpenAI-compatible endpoint with correct headers", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              files: [{ path: "src/hello.ts", contents: "console.log('hello');" }],
            }),
          },
        }],
      }),
    });

    const adapter = createApiAdapter("my-key", "https://api.deepseek.com", "deepseek-chat");
    const result = await adapter.wake(ctx);

    expect(result.status).toBe("woken");
    const postCall = mockFetch.mock.calls[1];
    expect(postCall[0]).toBe("https://api.deepseek.com/v1/chat/completions");
    const opts = postCall[1];
    expect(opts.headers.authorization).toBe("Bearer my-key");
    expect(opts.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("deepseek-chat");
    expect(body.messages).toHaveLength(2);
  });

  it("throws on API error status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const adapter = createApiAdapter("bad-key", "https://api.test.com", "test-model");
    await expect(adapter.wake(ctx)).rejects.toThrow("API 401");
  });

  it("throws on unparseable output", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not valid json" } }],
      }),
    });

    const adapter = createApiAdapter("test-key", "https://api.test.com", "test-model");
    await expect(adapter.wake(ctx)).rejects.toThrow("unparseable output");
  });

  it("writes files and opens a PR on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              files: [
                { path: "src/hello.ts", contents: "console.log('hello');" },
                { path: "test/hello.test.ts", contents: "it('works');" },
              ],
            }),
          },
        }],
      }),
    });

    const adapter = createApiAdapter("test-key", "https://api.test.com", "test-model");
    const result = await adapter.wake(ctx);

    expect(result.status).toBe("woken");
    expect(result.detail).toContain("PR opened");
    expect(writeFileSync).toHaveBeenCalledTimes(2);
    expect(execFileSync).toHaveBeenCalledWith("git", ["add", "-A"], { stdio: "inherit" });
  });

  it("skips unsafe paths in the output", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              files: [
                { path: "../../../etc/passwd", contents: "malicious" },
                { path: "src/safe.ts", contents: "safe content" },
              ],
            }),
          },
        }],
      }),
    });

    const adapter = createApiAdapter("test-key", "https://api.test.com", "test-model");
    await adapter.wake(ctx);

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeFileSync).mock.calls[0][0]).toContain("src/safe.ts");
  });

  it("reads config from env vars when not passed explicitly", async () => {
    vi.stubEnv("API_KEY", "env-key");
    vi.stubEnv("API_BASE", "https://api.env.com");
    vi.stubEnv("API_MODEL", "env-model");

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ files: [{ path: "src/x.ts", contents: "x" }] }),
          },
        }],
      }),
    });

    const adapter = createApiAdapter();
    await adapter.wake(ctx);

    const postCall = mockFetch.mock.calls[1];
    expect(postCall[0]).toBe("https://api.env.com/v1/chat/completions");
    const body = JSON.parse(postCall[1].body);
    expect(body.model).toBe("env-model");
    expect(postCall[1].headers.authorization).toBe("Bearer env-key");
  });
});
