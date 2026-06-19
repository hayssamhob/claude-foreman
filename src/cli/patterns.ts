/**
 * `foreman init --pattern` scaffolding mechanism (M5-6).
 *
 * A pattern is a named standing loop — a declarative recipe that describes
 * what the loop does, its trigger, its budget, and its gotchas. Patterns
 * live in `recipes/` as markdown files with YAML frontmatter.
 *
 * `foreman init --pattern <name>` scaffolds a working standing loop from a
 * named pattern into the target repo. High-cost patterns are metered (M1-4
 * CostLedger) — the pattern declares its cost tier and the referee enforces it.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** A pattern's YAML frontmatter (parsed minimally — no external YAML dep). */
export interface PatternMeta {
  name: string;
  description: string;
  costTier: "free" | "low" | "medium" | "high";
  trigger: string; // e.g. "on: schedule", "on: workflow_dispatch", "on: issues"
  schedule?: string; // cron expression if trigger is schedule
  metered: boolean; // whether the pattern is metered by CostLedger
}

/** A parsed pattern recipe. */
export interface Pattern {
  meta: PatternMeta;
  body: string; // the markdown body (instructions, gotchas, etc.)
  workflow: string; // the GitHub Actions workflow YAML to scaffold
}

/** Parse a pattern file (markdown with YAML frontmatter). */
export function parsePattern(content: string): Pattern {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error("Pattern file missing YAML frontmatter");

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const meta: PatternMeta = {
    name: extractField(frontmatter, "name") ?? "",
    description: extractField(frontmatter, "description") ?? "",
    costTier: (extractField(frontmatter, "costTier") as PatternMeta["costTier"]) ?? "free",
    trigger: extractField(frontmatter, "trigger") ?? "on: workflow_dispatch",
    schedule: extractField(frontmatter, "schedule"),
    metered: extractField(frontmatter, "metered") === "true",
  };

  // The workflow is embedded in the body as a fenced code block
  const workflowMatch = body.match(/```yaml\n([\s\S]*?)\n```/);
  const workflow = workflowMatch ? workflowMatch[1] : generateDefaultWorkflow(meta);

  return { meta, body, workflow };
}

function extractField(frontmatter: string, field: string): string | undefined {
  const re = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const m = frontmatter.match(re);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

function generateDefaultWorkflow(meta: PatternMeta): string {
  const scheduleBlock = meta.schedule ? `  schedule:\n    - cron: "${meta.schedule}"\n` : "";
  return `name: ${meta.name}
${meta.trigger}:
${scheduleBlock}  workflow_dispatch:

jobs:
  ${meta.name}:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Run ${meta.name}
        run: npx foreman run --pattern ${meta.name}`;
}

/** List all available patterns from the recipes/ directory. */
export function listPatterns(recipesDir: string): string[] {
  if (!existsSync(recipesDir)) return [];
  return readdirSync(recipesDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/** Load a pattern by name from the recipes/ directory. */
export function loadPattern(recipesDir: string, name: string): Pattern {
  const path = join(recipesDir, `${name}.md`);
  if (!existsSync(path)) throw new Error(`Pattern "${name}" not found in ${recipesDir}`);
  return parsePattern(readFileSync(path, "utf8"));
}

/** Scaffold a pattern into a target repo. */
export interface ScaffoldResult {
  workflowPath: string;
  readmePath: string;
  workflowCreated: boolean;
  readmeCreated: boolean;
  pattern: Pattern;
}

export function scaffoldPattern(opts: {
  pattern: Pattern;
  targetDir?: string;
  workflowsDir?: string;
}): ScaffoldResult {
  const targetDir = resolve(opts.targetDir ?? ".");
  const workflowsDir = opts.workflowsDir ?? join(targetDir, ".github", "workflows");

  if (!existsSync(workflowsDir)) mkdirSync(workflowsDir, { recursive: true });

  const workflowPath = join(workflowsDir, `${opts.pattern.meta.name}.yml`);
  const readmePath = join(targetDir, `${opts.pattern.meta.name}.README.md`);

  const workflowCreated = !existsSync(workflowPath);
  const readmeCreated = !existsSync(readmePath);

  if (workflowCreated) writeFileSync(workflowPath, opts.pattern.workflow + "\n", "utf8");
  if (readmeCreated) {
    const readme = formatPatternReadme(opts.pattern);
    writeFileSync(readmePath, readme, "utf8");
  }

  return { workflowPath, readmePath, workflowCreated, readmeCreated, pattern: opts.pattern };
}

function formatPatternReadme(pattern: Pattern): string {
  return `# Pattern: ${pattern.meta.name}

> ${pattern.meta.description}

## Metadata

| Field | Value |
|---|---|
| Cost tier | ${pattern.meta.costTier} |
| Trigger | ${pattern.meta.trigger} |
| Metered | ${pattern.meta.metered ? "yes — CostLedger enforces budget" : "no"} |
${pattern.meta.schedule ? `| Schedule | \`${pattern.meta.schedule}\` |` : ""}

## Details

${pattern.body}

## Scaffolded by

\`foreman init --pattern ${pattern.meta.name}\` — this file and the workflow in
\`.github/workflows/${pattern.meta.name}.yml\` were generated from the pattern recipe.
`;
}
