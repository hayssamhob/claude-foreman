/**
 * Create the protocol labels in a repo using the GitHub App's own credentials
 * (no gh CLI needed).
 *
 *   npx tsx scripts/ensure-labels.ts owner/repo
 */
import { createProbot } from "probot";
import { config } from "../src/config.js";
import { labelDefinitions } from "../src/protocol/labels.js";

const repoFull = process.argv[2];
if (!repoFull || !repoFull.includes("/")) {
  console.error("usage: npx tsx scripts/ensure-labels.ts owner/repo");
  process.exit(1);
}
const [owner, repo] = repoFull.split("/");

const labels = labelDefinitions(config.agents, config.holdLabel);

const probot = createProbot();
const appAuth = await probot.auth();
const { data: installations } = await appAuth.rest.apps.listInstallations({ per_page: 100 });

let octokit;
for (const inst of installations) {
  const candidate = await probot.auth(inst.id);
  const { data } = await candidate.rest.apps.listReposAccessibleToInstallation({ per_page: 100 });
  if (data.repositories.some((r) => r.full_name.toLowerCase() === repoFull.toLowerCase())) {
    octokit = candidate;
    break;
  }
}
if (!octokit) {
  console.error(`The app is not installed on ${repoFull}`);
  process.exit(1);
}

for (const l of labels) {
  try {
    await octokit.rest.issues.createLabel({ owner, repo, ...l });
    console.log(`created ${l.name}`);
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 422) console.log(`exists  ${l.name}`);
    else throw e;
  }
}
console.log(`Done: ${labels.length} labels ensured on ${repoFull}`);
