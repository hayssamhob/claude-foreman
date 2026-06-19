---
name: post-merge-cleanup
description: "Deletes merged branches and closes linked issues after a PR merges"
costTier: "free"
trigger: "on: pull_request"
metered: false
---

# Post-Merge-Cleanup

Deletes merged branches and closes linked issues after a PR is merged.

## What it does

1. Triggered when a PR is merged
2. Deletes the merged branch (if it's not `main` or a protected branch)
3. Closes the issue linked by "Closes #N" in the PR body
4. Posts a cleanup summary comment

## Surface

PR merge events — `on: pull_request` with `closed` type

## Gotchas

- Never delete `main`, `master`, or protected branches
- Only delete branches that belong to the merged PR (not shared branches)
- If the PR body doesn't contain "Closes #N", skip issue closure

## Workflow

```yaml
name: post-merge-cleanup
on:
  pull_request:
    types: [closed]
  workflow_dispatch:

jobs:
  post-merge-cleanup:
    runs-on: ubuntu-latest
    if: github.event.pull_request.merged == true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Run Post-Merge-Cleanup
        run: npx foreman run --pattern post-merge-cleanup
```
