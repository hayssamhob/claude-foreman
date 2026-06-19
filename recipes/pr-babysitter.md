---
name: pr-babysitter
description: "Keeps open PRs rebased and re-runs flaky checks — metered hard to prevent runaway costs"
costTier: "high"
trigger: "on: schedule"
schedule: "0 */4 * * *"
metered: true
---

# PR-Babysitter

Keeps open PRs rebased on main and re-runs flaky checks. Metered hard — each rebase
and check re-run costs CI minutes and potentially Fighter tokens.

## What it does

1. Finds open PRs that are behind main
2. Rebases them (if the branch is owned by the App)
3. Re-runs failed checks that look flaky (transient failures)
4. Posts a status comment on each PR it touched

## Surface

Open PRs — `gh pr list --state open`

## Gotchas

- **Metered hard** — this pattern runs every 4 hours and each run can cost CI minutes
- Don't rebase PRs that have unresolved review conversations — wait for the Coach
- Flaky detection: only re-run checks that failed with a transient signal (timeout, runner error)
- Don't force-push to branches you don't own — check the branch author first

## Workflow

```yaml
name: pr-babysitter
on:
  schedule:
    - cron: "0 */4 * * *"
  workflow_dispatch:

jobs:
  pr-babysitter:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Run PR-Babysitter
        run: npx foreman run --pattern pr-babysitter
```
