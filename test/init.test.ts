import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initLoop } from "../src/cli/init.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "foreman-init-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("initLoop", () => {
  it("creates both files in an empty directory", () => {
    const r = initLoop({ dir: tempDir });
    expect(existsSync(r.budgetPath)).toBe(true);
    expect(existsSync(r.logPath)).toBe(true);
    expect(r.budgetCreated).toBe(true);
    expect(r.logCreated).toBe(true);
  });

  it("creates both files in the current directory when dir is not specified", () => {
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      const r = initLoop();
      expect(existsSync(r.budgetPath)).toBe(true);
      expect(existsSync(r.logPath)).toBe(true);
    } finally {
      process.chdir(cwd);
    }
  });

  it("is idempotent — does not overwrite existing files", () => {
    initLoop({ dir: tempDir });
    const budgetPath = join(tempDir, "loop-budget.md");
    // Modify the file to verify it's not overwritten
    writeFileSync(budgetPath, "CUSTOM CONTENT", "utf8");

    initLoop({ dir: tempDir });
    expect(readFileSync(budgetPath, "utf8")).toBe("CUSTOM CONTENT");
  });

  it("reports budgetCreated=false when file already exists", () => {
    initLoop({ dir: tempDir });
    const r = initLoop({ dir: tempDir });
    expect(r.budgetCreated).toBe(false);
    expect(r.logCreated).toBe(false);
  });

  it("budget file contains cost ceilings table", () => {
    const r = initLoop({ dir: tempDir });
    const content = readFileSync(r.budgetPath, "utf8");
    expect(content).toContain("MAX_USD");
    expect(content).toContain("MAX_TOKENS");
    expect(content).toContain("Cost ceilings");
  });

  it("run-log file contains the entries marker", () => {
    const r = initLoop({ dir: tempDir });
    const content = readFileSync(r.logPath, "utf8");
    expect(content).toContain("Loop Run Log");
    expect(content).toContain("<!-- The loop appends entries below this line");
  });

  it("creates the directory if it does not exist", () => {
    const nested = join(tempDir, "nested", "dir");
    const r = initLoop({ dir: nested });
    expect(existsSync(r.budgetPath)).toBe(true);
    expect(existsSync(r.logPath)).toBe(true);
  });
});
