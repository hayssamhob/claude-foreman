import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runPreviewCheck, isPreviewEnabled, previewGate, defaultPreviewConnector, type PreviewConnector } from "../../src/referee/preview-mcp.js";

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock spawn
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    kill: vi.fn(),
    on: vi.fn(),
  })),
}));

// Mock process.kill
const originalKill = process.kill;
vi.spyOn(process, "kill").mockImplementation(() => true);

describe("isPreviewEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns false when PREVIEW_ENABLED is not set", () => {
    vi.stubEnv("PREVIEW_ENABLED", "");
    expect(isPreviewEnabled()).toBe(false);
  });

  it("returns true when PREVIEW_ENABLED is true", () => {
    vi.stubEnv("PREVIEW_ENABLED", "true");
    expect(isPreviewEnabled()).toBe(true);
  });

  it("returns false when PREVIEW_ENABLED is anything else", () => {
    vi.stubEnv("PREVIEW_ENABLED", "false");
    expect(isPreviewEnabled()).toBe(false);
  });
});

describe("previewGate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns ok when preview is disabled", async () => {
    vi.stubEnv("PREVIEW_ENABLED", "");
    const result = await previewGate();
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("disabled");
  });

  it("returns ok when preview check passes", async () => {
    vi.stubEnv("PREVIEW_ENABLED", "true");
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "Hello World" });
    const result = await previewGate({
      ...defaultPreviewConnector,
      healthUrl: "http://localhost:9999",
      bodyAssertion: null,
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(true);
  });

  it("returns not ok when health check fails", async () => {
    vi.stubEnv("PREVIEW_ENABLED", "true");
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await previewGate({
      ...defaultPreviewConnector,
      healthUrl: "http://localhost:9999",
      timeoutMs: 3000,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("did not become healthy");
  });
});

describe("runPreviewCheck", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns ok when health check returns 200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "OK" });
    const connector: PreviewConnector = {
      name: "test",
      startCommand: "echo",
      startArgs: ["hello"],
      healthUrl: "http://localhost:9999",
      bodyAssertion: null,
      timeoutMs: 5000,
    };
    const result = await runPreviewCheck(connector);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("returns not ok when body assertion fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "Hello World" });
    const connector: PreviewConnector = {
      name: "test",
      startCommand: "echo",
      startArgs: ["hello"],
      healthUrl: "http://localhost:9999",
      bodyAssertion: "expected string",
      timeoutMs: 5000,
    };
    const result = await runPreviewCheck(connector);
    expect(result.ok).toBe(false);
    expect(result.bodyMatch).toBe(false);
    expect(result.detail).toContain("does not contain");
  });

  it("returns ok when body assertion passes", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "Hello expected string World" });
    const connector: PreviewConnector = {
      name: "test",
      startCommand: "echo",
      startArgs: ["hello"],
      healthUrl: "http://localhost:9999",
      bodyAssertion: "expected string",
      timeoutMs: 5000,
    };
    const result = await runPreviewCheck(connector);
    expect(result.ok).toBe(true);
    expect(result.bodyMatch).toBe(true);
  });

  it("returns not ok when app does not become healthy in time", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const connector: PreviewConnector = {
      name: "test",
      startCommand: "echo",
      startArgs: ["hello"],
      healthUrl: "http://localhost:9999",
      bodyAssertion: null,
      timeoutMs: 2000,
    };
    const result = await runPreviewCheck(connector);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("did not become healthy");
  });

  it("returns not ok when health check returns non-200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Error" });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Error" });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Error" });
    const connector: PreviewConnector = {
      name: "test",
      startCommand: "echo",
      startArgs: ["hello"],
      healthUrl: "http://localhost:9999",
      bodyAssertion: null,
      timeoutMs: 3000,
    };
    const result = await runPreviewCheck(connector);
    expect(result.ok).toBe(false);
  });

  it("includes duration in the result", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "OK" });
    const connector: PreviewConnector = {
      name: "test",
      startCommand: "echo",
      startArgs: ["hello"],
      healthUrl: "http://localhost:9999",
      bodyAssertion: null,
      timeoutMs: 5000,
    };
    const result = await runPreviewCheck(connector);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("uses the connector name in the detail message", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "OK" });
    const connector: PreviewConnector = {
      name: "my-preview",
      startCommand: "echo",
      startArgs: ["hello"],
      healthUrl: "http://localhost:9999",
      bodyAssertion: null,
      timeoutMs: 5000,
    };
    const result = await runPreviewCheck(connector);
    expect(result.detail).toContain("my-preview");
  });
});
