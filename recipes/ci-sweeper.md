---
name: ci-sweeper
description: "A standing loop that fixes red CI runs — surfaces failing Actions runs and dispatches a Fighter to fix them"
costTier: "low"
trigger: "on: schedule"
schedule: "*/30 * * * *"
metered: true
---

# CI-Sweeper

A standing loop that watches for red CI runs and dispatches a Fighter to fix them.

## What it does

1. Polls the GitHub Actions API for failed workflow runs
2. For each failed run, creates a task issue labeled `agent:<cheapest-available>`
3. The Fighter reads the CI logs, fixes the failure, opens a PR
4. The Referee gates the PR on CI passing

## Surface

GitHub Actions CI runs — `GET /repos/{owner}/{repo}/actions/runs?status=failure`

## Gotchas

- Don't fix the same CI failure twice — the Evolution loop (M5-5) appends a gotcha
- If the failure is in excluded scope (auth/secrets/migrations), escalate to the Coach
- Metered: each dispatch costs Fighter tokens — the CostLedger enforces the budget

## Workflow

```yaml
name: ci-sweeper
on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:

jobs:
  ci-sweeper:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Run CI-Sweeper
        run: npx foreman run --pattern ci-sweeper
```
