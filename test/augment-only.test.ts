import { describe, it, expect } from "vitest";
import { buildTaskBody } from "../src/manager/worker.js";
import { decomposePrompt } from "../src/manager/prompts.js";

const AUGMENT_ONLY_SENTINEL = "<!-- augment-only: true -->";

describe("Augment-Only Classifier", () => {
  describe("buildTaskBody", () => {
    it("should include the sentinel when augmentOnly is true", () => {
      const body = buildTaskBody("spec", "agent1", 123, "owner/repo", 456, [], "", true);
      expect(body.includes(AUGMENT_ONLY_SENTINEL)).toBeTruthy();
      expect(body.includes("## ⚠️ Augment-Only")).toBeTruthy();
    });

    it("should NOT include the sentinel when augmentOnly is false", () => {
      const body = buildTaskBody("spec", "agent1", 123, "owner/repo", 456, [], "", false);
      expect(body.includes(AUGMENT_ONLY_SENTINEL)).toBeFalsy();
    });

    it("should NOT include the sentinel when augmentOnly arg is omitted (default)", () => {
      const body = buildTaskBody("spec", "agent1", 123, "owner/repo", 456, [], "");
      expect(body.includes(AUGMENT_ONLY_SENTINEL)).toBeFalsy();
    });
  });

  describe("decomposePrompt", () => {
    it("should include instructions for augmentOnly and expect it in the JSON output shape", () => {
      const prompt = decomposePrompt({
        epicTitle: "Test Epic",
        epicBody: "This is a test epic body",
        agents: ["agent1", "agent2"],
        repo: "owner/repo",
      });

      expect(prompt.includes("augmentOnly")).toBeTruthy();
      expect(prompt.includes('"augmentOnly": <true|false>')).toBeTruthy();
    });
  });
});
