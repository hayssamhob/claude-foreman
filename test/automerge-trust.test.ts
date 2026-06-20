import { describe, it, expect, vi, beforeEach } from "vitest";
import { sweepAutoMerge } from "../src/automerge.js";

const mockConfig = vi.hoisted(() => ({
  autoMerge: true,
  defaultTrustTier: "L1" as "L1" | "L2" | "L3",
  checkName: "Coach Review",
  holdLabel: "hold",
  managerName: "coach",
}));

vi.mock("../src/config.js", () => ({ config: mockConfig }));
vi.mock("../src/threads.js", () => ({
  ciStateFor: vi.fn().mockResolvedValue({ overall: "green", detail: "3 checks passed" }),
  unresolvedThreads: vi.fn().mockResolvedValue({ open: [], resolvedCount: 0, total: 0 }),
  prChangedFiles: vi.fn().mockResolvedValue(["src/foo.ts"]),
}));
vi.mock("../src/guard/exclusion.js", () => ({
  checkExclusion: vi.fn().mockReturnValue({ banned: false, matchedPaths: [] }),
}));
vi.mock("../src/github.js", () => ({
  postMessage: vi.fn().mockResolvedValue(undefined),
  splitRepo: vi.fn((repo: string) => {
    const [owner, name] = repo.split("/");
    return { owner, repo: name };
  }),
}));
vi.mock("../src/notify.js", () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/referee/preview-mcp.js", () => ({
  isPreviewEnabled: vi.fn().mockReturnValue(false),
  previewGate: vi.fn().mockResolvedValue({ ok: true, reason: "" }),
}));

function makeStore() {
  return {
    listTasks: vi.fn().mockReturnValue([
      {
        repo: "owner/repo",
        issue: 1,
        pr: 42,
        installation_id: 123,
        status: "approved",
        agent: "ollama",
        title: "Test task",
      },
    ]),
  } as any;
}

function makeOctokit(mergeable = true) {
  const mergeMock = vi.fn().mockResolvedValue({ data: {} });
  return {
    octokit: {
      rest: {
        pulls: {
          get: vi.fn().mockResolvedValue({ data: { merged: false, state: "open", mergeable } }),
          merge: mergeMock,
        },
        issues: {
          listLabelsOnIssue: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    },
    mergeMock,
  };
}

describe("sweepAutoMerge trust-ladder enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.defaultTrustTier = "L1";
  });

  it("refuses to merge at L1 even when every other gate is green", async () => {
    const store = makeStore();
    const { octokit, mergeMock } = makeOctokit();
    const auth = vi.fn().mockResolvedValue(octokit);
    const log = vi.fn();

    await sweepAutoMerge(store, auth, log);

    expect(mergeMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("auto-merge refused"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("L1"));
  });

  it("allows a low-risk merge at L2", async () => {
    mockConfig.defaultTrustTier = "L2";
    const store = makeStore();
    const { octokit, mergeMock } = makeOctokit();
    const auth = vi.fn().mockResolvedValue(octokit);
    const log = vi.fn();

    await sweepAutoMerge(store, auth, log);

    expect(mergeMock).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("auto-merged"));
  });

  it("refuses a high-risk merge at L2 by escalating to the Coach", async () => {
    mockConfig.defaultTrustTier = "L2";
    const { checkExclusion } = await import("../src/guard/exclusion.js");
    vi.mocked(checkExclusion).mockReturnValue({
      banned: true,
      matchedPaths: [{ path: "src/auth/login.ts", bannedPath: { pattern: "**/auth/**", reason: "auth", category: "auth" } }],
    });
    const store = makeStore();
    const { octokit, mergeMock } = makeOctokit();
    const auth = vi.fn().mockResolvedValue(octokit);
    const log = vi.fn();

    await sweepAutoMerge(store, auth, log);

    expect(mergeMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("auto-merge refused"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("high-risk"));
  });
});
