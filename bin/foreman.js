#!/usr/bin/env node

import { runInitCli } from "../src/cli/init.js";

const args = process.argv.slice(2);
const command = args[0];

if (command === "init") {
  runInitCli(args.slice(1));
} else {
  console.error("Usage: foreman init [--dir <path>]");
  console.error("");
  console.error("Commands:");
  console.error("  init    Scaffold loop-budget.md + loop-run-log.md in the target repo");
  process.exit(1);
}
