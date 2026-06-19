---
name: changelog-drafter
description: "Seeds GitHub Release notes from merged PRs + labels"
costTier: "free"
trigger: "on: schedule"
schedule: "0 0 * * 0"
metered: false
---

# Changelog-Drafter

Seeds release notes from merged PRs and their labels, then creates a GitHub Release draft.

## What it does

1. Collects all PRs merged since the last release tag
2. Groups them by label (`type:feat`, `type:fix`, `type:refactor`, etc.)
3. Generates a markdown changelog
4. Creates a GitHub Release draft with the changelog

## Surface

Merged PRs + git tags — `gh pr list --state merged` + `gh release list`

## Gotchas

- Breaking changes (label `breaking`) go at the top with a warning
- PRs without a `type:` label go into "Other changes"
- The draft is not published — the Coach reviews and publishes

## Workflow

```yaml
name: changelog-drafter
on:
  schedule:
    - cron: "0 0 * * 0"
  workflow_dispatch:

jobs:
  changelog-drafter:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Run Changelog-Drafter
        run: npx foreman run --pattern changelog-drafter
```
