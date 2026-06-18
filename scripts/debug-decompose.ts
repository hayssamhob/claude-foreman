import { runManager } from "../src/manager/runner.js";
import { decomposePrompt } from "../src/manager/prompts.js";

const prompt = decomposePrompt({
  epicTitle: "Epic: add a simple CLI todo app",
  epicBody:
    "Build a small Node.js CLI todo app in this repo: add/list/done commands, tasks stored in a local JSON file, with unit tests and a README section explaining usage.",
  agents: ["antigravity", "windsurf"],
  repo: "hayssamhob/agent-manager-sandbox",
});

runManager<{ tasks: unknown[] }>(prompt)
  .then((r) => console.log("PARSED OK, tasks:", JSON.stringify(r.tasks).slice(0, 600)))
  .catch((e) => console.log("FAILED:", e.message));
