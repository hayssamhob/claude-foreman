/**
 * Create the protocol labels in a repo. Uses the gh CLI's stored auth.
 *
 *   npx tsx scripts/setup-labels.ts owner/repo
 */
import { execFileSync } from "node:child_process";
import { config } from "../src/config.js";
import { agentLabel, ALL_STATUS, LABEL_EPIC, LABEL_TASK, statusLabel } from "../src/protocol/labels.js";

const repo = process.argv[2];
if (!repo || !repo.includes("/")) {
  console.error("usage: npx tsx scripts/setup-labels.ts owner/repo");
  process.exit(1);
}

const labels: { name: string; color: string; description: string }[] = [
  { name: LABEL_TASK, color: "1d76db", description: "Dispatchable task for an AI agent" },
  { name: LABEL_EPIC, color: "5319e7", description: "Epic — manager will decompose into tasks" },
  ...config.agents.map((a) => ({
    name: agentLabel(a),
    color: "0e8a16",
    description: `Routed to agent: ${a}`,
  })),
  ...ALL_STATUS.map((s) => ({
    name: statusLabel(s),
    color: "fbca04",
    description: `Task status: ${s}`,
  })),
];

for (const l of labels) {
  try {
    execFileSync(
      "gh",
      ["label", "create", l.name, "--repo", repo, "--color", l.color, "--description", l.description, "--force"],
      { stdio: "inherit" }
    );
  } catch {
    console.error(`failed to create label ${l.name}`);
    process.exitCode = 1;
  }
}
console.log(`\nDone: ${labels.length} labels ensured on ${repo}`);
