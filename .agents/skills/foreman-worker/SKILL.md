---
name: foreman-worker
description: A background worker skill that polls the claude-foreman queue for agent:antigravity issues and works them.
---

# Foreman Worker Skill

This skill allows Antigravity to act as a self-polling Fighter for the claude-foreman repository. 
Rather than relying on a CI runner to push tasks to the agent, Antigravity uses its native scheduling capabilities to pull tasks directly from GitHub.

## Setup Instructions

To start the worker, execute the `schedule` slash command or tool to create a background cron job running every 5 minutes (`*/5 * * * *`).

### Cron Prompt

When setting up the schedule, provide the following prompt:

```text
Check the hayssamhob/claude-foreman repository for open issues labeled `agent:antigravity` that do not have a corresponding branch yet. 
If found:
1. Read the issue body carefully. The body is the brief.
2. Claim the issue by posting a comment: "I'll take this one! Claiming for @antigravity."
3. Checkout a new branch `feat/issue-<N>-<slug>` from `main`.
4. Implement the requested changes according to the issue's brief and the FIGHTER_PROTOCOL.md rules.
5. Run `npm run build && npm test`. Ensure all tests pass.
6. Commit, push the branch, and open a PR using `gh pr create` with a detailed description.
7. Post the done signal on the PR: `@hayssamhob ✅ #<N> done (antigravity) — <short summary>. All <X> tests passed.`

Also use `npx tsx scripts/fighter-inbox.ts --agent antigravity --mark-read` to check for Coach messages and reply to them.
```
