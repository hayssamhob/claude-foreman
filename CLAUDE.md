# CLAUDE.md — Source of truth for AI agents on claude-foreman

> This file exists so every agent session starts from the same project truth instead of
> re-deriving it. It is intentionally short — the deep content lives in the files below.

## Read these first

1. **`AGENTS.md`** — mandatory workflow, done-contract checklist, key file map, CI gotchas.
2. **`gotchas.md`** — every mistake the loop has made is documented here. Read it every session.
3. **`SPEC.md`** — the full design blueprint (§5.7, §6.3, §8 for acceptance criteria).

## What this project is

**Claude Foreman** — a GitHub-native autonomous coding supervisor. The Coach (a senior
model) plans and reviews; free/cheap Fighters write the code; the Referee gates every merge
on tests + acceptance criteria + budget. Work flows as a queue of GitHub issues:
dispatch → grill → implement → review → merge.

## Tech stack

- **TypeScript** (Node 20+, ESM) — the spine
- **Vitest** (not Jest) — `npm test` or `npx vitest run <file>`
- **Probot** — GitHub App framework
- **better-sqlite3** — local state (native module; Windows needs Visual Studio, see G6)

## Non-negotiable workflow

1. `gh issue view <N>` — read the grilled brief + acceptance criteria
2. Branch `feat/issue-<N>-<slug>` or `fix/issue-<N>-<slug>`
3. Implement following existing conventions
4. `npm run build && npm test` must be green
5. Open a PR with `Closes #N` in the body
6. Post the done-signal: `gh pr comment <PR> --body "@hayssamhob ✅ #N done — <sentence>"`

## CI

- Matrix: ubuntu-latest, macos-latest, windows-latest
- Windows is `continue-on-error` (known `better-sqlite3` false negative — see `gotchas.md` G6)
- Branch protection on `main` requires ubuntu + macOS checks, 1 approval, resolved threads

## Current focus

See open issues with `gh issue list`. Epics M0–M5 track the milestone roadmap.
