#!/usr/bin/env node

import { runInitCli } from "../src/cli/init.js";
import { listPatterns, loadPattern, scaffoldPattern } from "../src/cli/patterns.js";
import { join } from "node:path";

const args = process.argv.slice(2);
const command = args[0];

if (command === "init") {
  const rest = args.slice(1);
  const patternIdx = rest.indexOf("--pattern");
  const patternName = patternIdx >= 0 && patternIdx + 1 < rest.length ? rest[patternIdx + 1] : undefined;

  if (patternName) {
    // foreman init --pattern <name>
    const recipesDir = join(process.cwd(), "recipes");
    try {
      const pattern = loadPattern(recipesDir, patternName);
      const result = scaffoldPattern({ pattern });
      if (result.workflowCreated) {
        console.log(`✅ Created ${result.workflowPath}`);
      } else {
        console.log(`⏭️  ${result.workflowPath} already exists — skipped`);
      }
      if (result.readmeCreated) {
        console.log(`✅ Created ${result.readmePath}`);
      } else {
        console.log(`⏭️  ${result.readmePath} already exists — skipped`);
      }
      console.log(`\nPattern "${patternName}" scaffolded. Cost tier: ${pattern.meta.costTier}.`);
      if (pattern.meta.metered) {
        console.log("⚠️  This pattern is metered — CostLedger will enforce the budget.");
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      console.error(`Available patterns: ${listPatterns(recipesDir).join(", ") || "(none found)"}`);
      process.exit(1);
    }
  } else {
    // foreman init (without --pattern)
    await runInitCli(rest);
  }
} else if (command === "patterns") {
  const recipesDir = join(process.cwd(), "recipes");
  const patterns = listPatterns(recipesDir);
  if (patterns.length === 0) {
    console.log("No patterns found in recipes/. Create a .md file with YAML frontmatter.");
  } else {
    console.log("Available patterns:");
    for (const name of patterns) {
      try {
        const p = loadPattern(recipesDir, name);
        console.log(`  ${name} — ${p.meta.description} [${p.meta.costTier}]`);
      } catch {
        console.log(`  ${name} — (parse error)`);
      }
    }
  }
} else {
  console.error("Usage: foreman <command> [options]");
  console.error("");
  console.error("Commands:");
  console.error("  init              Scaffold loop-budget.md + loop-run-log.md");
  console.error("  init --pattern N  Scaffold a standing loop from pattern N");
  console.error("  patterns          List available patterns from recipes/");
  process.exit(1);
}
