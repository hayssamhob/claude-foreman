import { describe, it, expect, vi } from "vitest";
import { postReview } from "../src/github.js";
import type { AgentMessage } from "../src/protocol/messages.js";

describe("postReview", () => {
  it("submits an APPROVE review with the plainSummary as the visible body", async () => {
    const createReview = vi.fn().mockResolvedValue({ data: {} });
    const octokit = { rest: { pulls: { createReview } } } as any;
    const msg: AgentMessage = { v: 1, type: "approval", from: "manager", to: "agent", task: 7, pr: 5 };
    await postReview(octokit, "o/r", 5, msg, "This change lets users export their data as CSV.", "APPROVE");
    expect(createReview).toHaveBeenCalledTimes(1);
    expect(createReview).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      pull_number: 5,
      event: "APPROVE",
      body: expect.stringContaining("This change lets users export their data as CSV."),
    });
    expect(createReview.mock.calls[0][0].body).toContain("<!-- agent-msg");
  });

  it("submits a REQUEST_CHANGES review when the coach requests revisions", async () => {
    const createReview = vi.fn().mockResolvedValue({ data: {} });
    const octokit = { rest: { pulls: { createReview } } } as any;
    const msg: AgentMessage = { v: 1, type: "revision-request", from: "manager", to: "agent", task: 7, pr: 5, round: 1 };
    await postReview(octokit, "o/r", 5, msg, "Need tests for the CSV path.", "REQUEST_CHANGES");
    expect(createReview).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      pull_number: 5,
      event: "REQUEST_CHANGES",
      body: expect.stringContaining("Need tests for the CSV path."),
    });
  });
});
