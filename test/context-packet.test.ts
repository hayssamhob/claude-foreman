import { describe, it, expect, vi } from "vitest";
import { assembleContextPacket, formatContextPacket } from "../src/context.js";
import type { Octokit } from "../src/octokit.js";

describe("Context Packet Assembly", () => {
  const repoStr = "hayssamhob/claude-foreman";

  it("assembles full context gracefully", async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listLabelsForRepo: vi.fn().mockResolvedValue({
            data: [{ name: "bug" }, { name: "feat" }],
          }),
        },
        git: {
          getTree: vi.fn().mockResolvedValue({
            data: { tree: [{ path: "src" }, { path: "package.json" }] },
          }),
        },
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: {
              type: "file",
              content: Buffer.from("Watch out for X").toString("base64"),
            },
          }),
        },
      },
    } as unknown as Octokit;

    const packet = await assembleContextPacket(mockOctokit, repoStr);
    expect(packet.labels).toEqual(["bug", "feat"]);
    expect(packet.fileTree).toEqual(["src", "package.json"]);
    expect(packet.gotchas).toBe("Watch out for X");

    const md = formatContextPacket(packet);
    expect(md).toContain("`bug`");
    expect(md).toContain("`feat`");
    expect(md).toContain("`src`");
    expect(md).toContain("`package.json`");
    expect(md).toContain("### Gotchas");
    expect(md).toContain("Watch out for X");
  });

  it("handles null gotchas gracefully", async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listLabelsForRepo: vi.fn().mockResolvedValue({ data: [] }),
        },
        git: {
          getTree: vi.fn().mockResolvedValue({ data: { tree: [] } }),
        },
        repos: {
          getContent: vi.fn().mockRejectedValue(new Error("404 not found")),
        },
      },
    } as unknown as Octokit;

    const packet = await assembleContextPacket(mockOctokit, repoStr);
    expect(packet.gotchas).toBeNull();

    const md = formatContextPacket(packet);
    expect(md).not.toContain("### Gotchas");
    expect(md).toContain("(none)");
  });

  it("handles allSettled failures without crashing", async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listLabelsForRepo: vi.fn().mockRejectedValue(new Error("API Error")),
        },
        git: {
          getTree: vi.fn().mockRejectedValue(new Error("API Error")),
        },
        repos: {
          getContent: vi.fn().mockRejectedValue(new Error("API Error")),
        },
      },
    } as unknown as Octokit;

    const packet = await assembleContextPacket(mockOctokit, repoStr);
    expect(packet.labels).toEqual([]);
    expect(packet.fileTree).toEqual([]);
    expect(packet.gotchas).toBeNull();
  });
});
