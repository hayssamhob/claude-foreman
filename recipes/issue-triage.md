---
name: issue-triage
description: "Labels and routes incoming issues via the template chooser"
costTier: "low"
trigger: "on: issues"
metered: true
---

# Issue-Triage

Labels and routes incoming issues based on their content and template.

## What it does

1. Reads new issues as they're opened
2. Applies labels based on the template used (`task.md` → `agent-task`, `epic.md` → `epic`)
3. Routes to the appropriate agent based on keywords in the title/body
4. Sets priority based on the issue's urgency markers

## Surface

New issues — `on: issues` webhook trigger

## Gotchas

- Don't auto-assign `agent:` labels — the Coach assigns after grilling the brief
- Issues without a template get `needs-triage` label for manual review
- The untrusted-input guard (M3-5) sanitizes issue text before any LLM processing

## Workflow

```yaml
name: issue-triage
on:
  issues:
    types: [opened, edited]
  workflow_dispatch:

jobs:
  issue-triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Run Issue-Triage
        run: npx foreman run --pattern issue-triage
```
