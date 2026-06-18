# Contributing to Claude Foreman

Welcome! We're building **Claude Foreman** — an open-source, GitHub-native autonomous coding orchestrator where *Claude thinks, free models type, and Foreman makes sure it's done right*. Your contributions help build a robust, **governed loop** for AI-assisted coding.

New to the cast? The **Coach** is a senior model that plans and reviews (it never writes code); the **Fighters** are free/cheap models that write the code; the **Judge** ranks candidates in best-of-N fusion; and the **Referee** is deterministic code that gates every merge on tests + acceptance criteria + budget. The whole design lives in **[SPEC.md](https://github.com/hayssamhob/claude-foreman/blob/main/SPEC.md)**.

## Ways to contribute

- **Good first issues** — start with [`good first issue`](https://github.com/hayssamhob/claude-foreman/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) tickets. Low-context wins that teach the codebase.
- **Add a Fighter / IDE adapter** — implement a new adapter behind the `FighterDriver` socket (it must pass the driver conformance suite). Cursor, Aider, DeepSeek, your-IDE-here — *"Foreman now drives &lt;your IDE&gt;"* is exactly the kind of contribution we love.
- **Contribute a recipe** — a declarative fusion recipe (panel / judge / writer / task-types) under `recipes/`, auto-validated in CI. You don't need to understand the Referee to ship a great recipe.
- **Improve the docs** — clarify a concept or a workflow.
- **Triage** — help categorize and prioritize issues using the [label taxonomy](#labels).

## Milestones & the blueprint

Work is organized as **epics (M0–M5)**, each tracked as GitHub issues with acceptance criteria. See **[SPEC.md](https://github.com/hayssamhob/claude-foreman/blob/main/SPEC.md)** for the full design blueprint and **[the milestones](https://github.com/hayssamhob/claude-foreman/milestones)** for what's in flight.

## Development setup

> **Heads up — Foreman is mid-scaffold** (you're watching M0 happen). The setup below describes the TypeScript spine *as it lands*; until the M0 import issues ([#4](https://github.com/hayssamhob/claude-foreman/issues/4), [#7](https://github.com/hayssamhob/claude-foreman/issues/7)) complete, not all of it runs yet. For docs- and recipe-level contributions, a clone and an editor are enough.

```bash
git clone https://github.com/hayssamhob/claude-foreman.git
cd claude-foreman
npm install
npm run build && npm test   # vitest
```

Node 20+. The headless path runs cross-platform (macOS / Linux / Windows); GUI-driver paths are macOS-first.

## How we work

1. **Claim an issue** — comment on it so we don't double up.
2. **Branch** — `feat/<short-desc>` or `agent/<name>/<issue-number>`.
3. **Commit** — [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …).
4. **Open a PR** — CI and the `foreman/*` Referee checks must be green; a maintainer (the Coach) reviews before merge.

## Labels

| Prefix | Meaning |
|---|---|
| `epic:M0`…`epic:M5` | Which milestone |
| `area:<subsystem>` | e.g. `area:driver`, `area:referee`, `area:fusion` |
| `type:feat \| fix \| refactor \| docs \| infra` | Change type |
| `weight:flyweight \| middleweight \| heavyweight` | Task complexity |
| `spine:adopt \| build \| harden \| extend \| expose` | Relationship to the existing TS spine |

## Code of Conduct

We follow the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Questions?

Open a [GitHub Discussion](https://github.com/hayssamhob/claude-foreman/discussions) or a new [issue](https://github.com/hayssamhob/claude-foreman/issues). Thanks for stepping into the ring. 🥊
