---
name: dependency-sweeper
description: "Orchestrates Dependabot bump PRs through the referee — verifies, merges, or escalates"
costTier: "free"
trigger: "on: schedule"
schedule: "0 6 * * 1"
metered: false
---

# Dependency-Sweeper

Governs Dependabot PRs through the Foreman referee instead of auto-merging blindly.

## What it does

1. Finds open Dependabot PRs
2. Runs the build + tests against each bump
3. If green, the referee approves and auto-merges
4. If red, escalates to the Coach with the failure context

## Surface

Dependabot PRs — `gh pr list --label "dependencies" --state open`

## Gotchas

- Major version bumps (e.g. v4 → v5) are never auto-merged — escalate to Coach
- Security bumps (label `security`) bypass the test gate — merge immediately
- The referee still checks the exclusion list — a Dependabot PR touching auth is flagged

## Workflow

```yaml
name: dependency-sweeper
on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

jobs:
  dependency-sweeper:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Run Dependency-Sweeper
        run: npx foreman run --pattern dependency-sweeper
```
