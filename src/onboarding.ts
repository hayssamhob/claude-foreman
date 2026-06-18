import { config } from "./config.js";
import { splitRepo } from "./github.js";
import { notify } from "./notify.js";
import type { Octokit } from "./octokit.js";
import { LABEL_EPIC, labelDefinitions } from "./protocol/labels.js";

/**
 * Zero-touch onboarding: the moment the app is installed on a repo, the repo
 * is ready — protocol labels exist and a welcome issue explains the workflow.
 * Idempotent: re-running on an already-onboarded repo only fills gaps.
 */
export async function onboardRepo(octokit: Octokit, repoFull: string, log: (m: string) => void): Promise<void> {
  const { owner, repo } = splitRepo(repoFull);

  // If our epic label already exists, this repo was onboarded before —
  // still ensure the rest of the label set, but skip the welcome issue.
  const alreadyOnboarded = await octokit.rest.issues
    .getLabel({ owner, repo, name: LABEL_EPIC })
    .then(() => true)
    .catch(() => false);

  for (const l of labelDefinitions(config.agents, config.holdLabel)) {
    await octokit.rest.issues.createLabel({ owner, repo, ...l }).catch((e: unknown) => {
      if ((e as { status?: number }).status !== 422) throw e; // 422 = exists
    });
  }

  if (!alreadyOnboarded) {
    await octokit.rest.issues.create({
      owner,
      repo,
      title: "👋 Your AI team now works on this project",
      body: welcomeBody(repoFull),
    });
    log(`onboarded ${repoFull}: labels created, welcome issue posted`);
    await notify("New project connected", `${repoFull} is ready — describe work in an epic issue or from the dashboard.`, {
      tags: ["wave"],
    });
  } else {
    log(`re-onboarded ${repoFull}: label set verified`);
  }
}

function welcomeBody(repoFull: string): string {
  return `The **agent-manager** app is installed on this repo. Here is how to put the AI team to work:

## Request work
- **From the dashboard** (easiest): open the local dashboard, pick *${repoFull.split("/")[1]}*, describe what you want.
- **From GitHub**: open an issue describing the goal and put the \`epic\` label on it — or comment \`/decompose\` on any existing issue.

The manager (Claude) breaks the epic into independent tasks and routes each to a junior agent (${config.agents.join(", ")}) via \`agent:<name>\` labels.

## What happens next
1. A junior claims its task (label flips to \`status:claimed\`) and works on branch \`agent/<name>/<issue>\`.
2. It opens a PR; the **Manager Review** check runs — the manager approves or requests numbered fixes (max ${config.maxRevisionRounds} rounds, then the task is reassigned).
3. ${config.autoMerge ? `Once approved, tests green, and every review conversation resolved, the PR **merges itself**. Put the \`${config.holdLabel}\` label on the task issue to keep a merge for yourself.` : "Once approved, you merge from the dashboard or GitHub."}

## Owner controls
- \`${config.holdLabel}\` label on a task = no auto-merge.
- Dashboard **Stop** / **Relaunch** buttons control any task.
- Comment on the PR files to open review conversations — juniors must reply with their fix commit and resolve them before anything merges.

*You can close this issue — it is just the welcome note.*`;
}
