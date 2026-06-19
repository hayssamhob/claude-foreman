import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parsePattern, listPatterns, loadPattern, scaffoldPattern, type Pattern } from "../src/cli/patterns.js";

let tempDir: string;
let recipesDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "patterns-"));
  recipesDir = join(tempDir, "recipes");
  mkdirSync(recipesDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const SAMPLE_PATTERN = `---
name: test-pattern
description: "A test pattern"
costTier: "low"
trigger: "on: schedule"
schedule: "0 * * * *"
metered: true
---

# Test Pattern

This is a test pattern.

\`\`\`yaml
name: test-pattern
on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hello
\`\`\`
`;

describe("parsePattern", () => {
  it("parses YAML frontmatter correctly", () => {
    const p = parsePattern(SAMPLE_PATTERN);
    expect(p.meta.name).toBe("test-pattern");
    expect(p.meta.description).toBe("A test pattern");
    expect(p.meta.costTier).toBe("low");
    expect(p.meta.trigger).toBe("on: schedule");
    expect(p.meta.schedule).toBe("0 * * * *");
    expect(p.meta.metered).toBe(true);
  });

  it("extracts the workflow YAML from the body", () => {
    const p = parsePattern(SAMPLE_PATTERN);
    expect(p.workflow).toContain("name: test-pattern");
    expect(p.workflow).toContain("cron: \"0 * * * *\"");
  });

  it("generates a default workflow when no YAML block is present", () => {
    const noWorkflow = `---
name: bare
description: "No workflow"
costTier: "free"
trigger: "on: workflow_dispatch"
metered: false
---

Just a description.
`;
    const p = parsePattern(noWorkflow);
    expect(p.workflow).toContain("name: bare");
    expect(p.workflow).toContain("workflow_dispatch");
  });

  it("throws on missing frontmatter", () => {
    expect(() => parsePattern("no frontmatter here")).toThrow("missing YAML frontmatter");
  });
});

describe("listPatterns", () => {
  it("returns empty array for non-existent directory", () => {
    expect(listPatterns(join(tempDir, "nonexistent"))).toEqual([]);
  });

  it("lists .md files without extension", () => {
    writeFileSync(join(recipesDir, "ci-sweeper.md"), SAMPLE_PATTERN);
    writeFileSync(join(recipesDir, "daily-triage.md"), SAMPLE_PATTERN);
    const patterns = listPatterns(recipesDir);
    expect(patterns).toContain("ci-sweeper");
    expect(patterns).toContain("daily-triage");
  });
});

describe("loadPattern", () => {
  it("loads and parses a pattern by name", () => {
    writeFileSync(join(recipesDir, "test.md"), SAMPLE_PATTERN);
    const p = loadPattern(recipesDir, "test");
    expect(p.meta.name).toBe("test-pattern");
  });

  it("throws for non-existent pattern", () => {
    expect(() => loadPattern(recipesDir, "nonexistent")).toThrow("not found");
  });
});

describe("scaffoldPattern", () => {
  it("creates the workflow file and README", () => {
    const pattern = parsePattern(SAMPLE_PATTERN);
    const result = scaffoldPattern({ pattern, targetDir: tempDir });
    expect(existsSync(result.workflowPath)).toBe(true);
    expect(existsSync(result.readmePath)).toBe(true);
    expect(result.workflowCreated).toBe(true);
    expect(result.readmeCreated).toBe(true);
  });

  it("is idempotent — does not overwrite existing files", () => {
    const pattern = parsePattern(SAMPLE_PATTERN);
    scaffoldPattern({ pattern, targetDir: tempDir });
    // Modify the workflow file
    const workflowPath = join(tempDir, ".github", "workflows", "test-pattern.yml");
    writeFileSync(workflowPath, "CUSTOM", "utf8");
    // Re-scaffold
    scaffoldPattern({ pattern, targetDir: tempDir });
    expect(readFileSync(workflowPath, "utf8")).toBe("CUSTOM");
  });

  it("creates the .github/workflows directory if it doesn't exist", () => {
    const pattern = parsePattern(SAMPLE_PATTERN);
    const result = scaffoldPattern({ pattern, targetDir: tempDir });
    expect(existsSync(join(tempDir, ".github", "workflows"))).toBe(true);
  });

  it("README contains pattern metadata", () => {
    const pattern = parsePattern(SAMPLE_PATTERN);
    const result = scaffoldPattern({ pattern, targetDir: tempDir });
    const readme = readFileSync(result.readmePath, "utf8");
    expect(readme).toContain("test-pattern");
    expect(readme).toContain("low");
    expect(readme.toLowerCase()).toContain("metered");
  });
});
