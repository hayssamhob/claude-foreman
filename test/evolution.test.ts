import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EvolutionLoop, type DetectorSignal } from "../src/referee/evolution.js";

let tempDir: string;
let gotchasPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "evolution-"));
  gotchasPath = join(tempDir, "gotchas.md");
  // Seed with existing G1-G5 so nextGotchaId starts at G6
  writeFileSync(
    gotchasPath,
    "## G1 — Test gotcha\n\nSome content\n\n## G5 — Another\n\nMore content\n",
    "utf8"
  );
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("EvolutionLoop", () => {
  it("does not append a gotcha below the threshold", () => {
    const loop = new EvolutionLoop({ gotchasPath, appendThreshold: 3 });
    const signal: DetectorSignal = { type: "stall", subtype: "no_diff", round: 1, reason: "no diff" };
    const result = loop.recordSignal(signal);
    expect(result).toBeNull();
    expect(loop.signalCount("stall:no_diff")).toBe(1);
  });

  it("appends a gotcha when the threshold is reached", () => {
    const loop = new EvolutionLoop({ gotchasPath, appendThreshold: 3 });
    const signal: DetectorSignal = { type: "stall", subtype: "no_diff", round: 1, reason: "no diff" };
    loop.recordSignal(signal);
    loop.recordSignal(signal);
    const result = loop.recordSignal(signal);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("G6");
    expect(result!.title).toContain("no diff");
  });

  it("resets the signal counter after appending a gotcha", () => {
    const loop = new EvolutionLoop({ gotchasPath, appendThreshold: 3 });
    const signal: DetectorSignal = { type: "stall", subtype: "no_diff", round: 1, reason: "no diff" };
    loop.recordSignal(signal);
    loop.recordSignal(signal);
    loop.recordSignal(signal);
    expect(loop.signalCount("stall:no_diff")).toBe(0);
  });

  it("writes the gotcha to gotchas.md", () => {
    const loop = new EvolutionLoop({ gotchasPath, appendThreshold: 2 });
    const signal: DetectorSignal = { type: "circle", subtype: "same_error", round: 2, reason: "same TS error" };
    loop.recordSignal(signal);
    loop.recordSignal(signal);
    const content = readFileSync(gotchasPath, "utf8");
    expect(content).toContain("## G6");
    expect(content).toContain("same_error");
    expect(content).toContain("same TS error");
  });

  it("increments the gotcha ID correctly", () => {
    const loop = new EvolutionLoop({ gotchasPath, appendThreshold: 1 });
    const s1: DetectorSignal = { type: "stall", subtype: "no_diff", round: 1, reason: "r1" };
    const s2: DetectorSignal = { type: "circle", subtype: "same_region", round: 2, reason: "r2" };

    const g1 = loop.recordSignal(s1);
    const g2 = loop.recordSignal(s2);
    expect(g1!.id).toBe("G6");
    expect(g2!.id).toBe("G7");
  });

  it("tracks different signal types independently", () => {
    const loop = new EvolutionLoop({ gotchasPath, appendThreshold: 3 });
    const stall: DetectorSignal = { type: "stall", subtype: "no_diff", round: 1, reason: "r" };
    const circle: DetectorSignal = { type: "circle", subtype: "same_error", round: 2, reason: "r" };

    loop.recordSignal(stall);
    loop.recordSignal(circle);
    loop.recordSignal(stall);
    expect(loop.signalCount("stall:no_diff")).toBe(2);
    expect(loop.signalCount("circle:same_error")).toBe(1);
  });

  it("produces a gotcha with a meaningful rule", () => {
    const loop = new EvolutionLoop({ gotchasPath, appendThreshold: 1 });
    const signal: DetectorSignal = { type: "circle", subtype: "net_zero", round: 3, reason: "net zero" };
    const gotcha = loop.recordSignal(signal);
    expect(gotcha!.rule.length).toBeGreaterThan(0);
    expect(gotcha!.rule.some((r) => r.includes("net_zero"))).toBe(true);
  });

  it("handles a non-existent gotchas.md gracefully", () => {
    const nonExistentPath = join(tempDir, "nonexistent.md");
    const loop = new EvolutionLoop({ gotchasPath: nonExistentPath, appendThreshold: 1 });
    const signal: DetectorSignal = { type: "stall", subtype: "no_diff", round: 1, reason: "r" };
    const result = loop.recordSignal(signal);
    expect(result).not.toBeNull();
    expect(existsSync(nonExistentPath)).toBe(true);
  });

  it("reset() clears all signal counts", () => {
    const loop = new EvolutionLoop({ gotchasPath, appendThreshold: 5 });
    const signal: DetectorSignal = { type: "stall", subtype: "no_diff", round: 1, reason: "r" };
    loop.recordSignal(signal);
    loop.recordSignal(signal);
    loop.reset();
    expect(loop.signalCount("stall:no_diff")).toBe(0);
  });
});
