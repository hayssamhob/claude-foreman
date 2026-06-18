import { describe, it, expect } from "vitest";
import { isTestsPassed } from "../src/junior/prompts.js";

describe("isTestsPassed — done-contract gate", () => {
  it("accepts boolean true", () => {
    expect(isTestsPassed(true)).toBe(true);
  });

  it("accepts stringified 'true' (LLM output)", () => {
    expect(isTestsPassed("true")).toBe(true);
    expect(isTestsPassed("True")).toBe(true);
    expect(isTestsPassed("TRUE")).toBe(true);
  });

  it("blocks boolean false", () => {
    expect(isTestsPassed(false)).toBe(false);
  });

  it("blocks stringified 'false' — the truthy string bypass", () => {
    expect(isTestsPassed("false")).toBe(false);
    expect(isTestsPassed("False")).toBe(false);
  });

  it("blocks undefined (fumbled-JSON fallback — intentional)", () => {
    expect(isTestsPassed(undefined)).toBe(false);
  });

  it("blocks null", () => {
    expect(isTestsPassed(null)).toBe(false);
  });

  it("blocks empty string", () => {
    expect(isTestsPassed("")).toBe(false);
  });
});
