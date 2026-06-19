---
name: daily-triage
description: "A scheduled tick that triages the backlog — re-prioritizes stale issues, escalates blocked ones"
costTier: "low"
trigger: "on: schedule"
schedule: "0 9 * * *"
metered: true
---

# Daily-Triage

A scheduled tick that triages the backlog every morning.

## What it does

1. Finds issues that have been open without activity for >7 days
2. Re-prioritizes based on labels and recent activity
3. Escalates blocked issues (labeled `blocked`) to the Coach
4. Closes stale issues that are no longer relevant (labeled `wontfix` or `stale`)

## Surface

Open issues — `gh issue list --state open`

## Gotchas

- Don't close issues automatically — only label them `stale` for the Coach to review
- The `blocked` label means an issue is waiting on a dependency — don't re-prioritize it
- Metered: the triage LLM call costs tokens — CostLedger enforces the daily budget

## Workflow

```yaml
name: daily-triage
on:
  schedule:
    - cron: "0 9 * * *"
  workflow_dispatch:

jobs:
  daily-triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Run Daily-Triage
        run: npx foreman run --pattern daily-triage
```
