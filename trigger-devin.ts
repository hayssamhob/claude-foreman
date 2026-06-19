import { devinLocalAdapter } from "./src/dispatch/devin-local.js";

async function run() {
  console.log("🚀 Triggering Devin Local adapter...");
  const result = await devinLocalAdapter.wake({
    repo: "hayssamhob/claude-foreman",
    issueNumber: 22,
    agent: "devin-local",
    brief: "Ignored by the new prompt logic",
    branch: "feat/issue-22-devin"
  });
  console.log("Result:", result);
}

run().catch(console.error);
