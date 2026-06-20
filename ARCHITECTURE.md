# Architecture

## Overview

Foreman is an AI-agent orchestration system that uses GitHub as its single source of truth. It coordinates a **Coach** (manager model that plans and reviews) and **Fighters** (execution agents that implement tasks) through a structured protocol on GitHub issues and PRs.

## The Ring

```
GitHub issue (grilled brief) ──label agent:X──▶ WAKE-UP LAYER ──▶ Fighter runtime ──▶ PR ──▶ Referee ──▶ merge
                                                     │
                          push adapters: Devin/Cursor REST API (hosted runner)
                          pull/CLI adapters: Ollama, Devin-Local, Cursor, Antigravity (self-hosted runner)
```

### The Three Roles

1. **Coach** (Manager) — decomposes epics into tasks, grills briefs, reviews PRs. Runs via `MANAGER_CMD` (default: `claude -p`).
2. **Fighter** — implements tasks, opens PRs. Each Fighter has an adapter in the wake-up layer (`src/dispatch/`).
3. **Referee** — gates PRs on CI oracle, done-contract, and review verdicts. Lives in `src/referee/`.

### The Wake-up Layer (M6)

The courier that turns "issue labeled `agent:X`" → "Fighter X actually runs and opens a PR." Adapters:

| Adapter | Label | Runtime | Status |
|---|---|---|---|
| devin (Cloud) | `agent:devin` | Hosted runner, REST API | Needs creds fix (#98) |
| devin-local | `agent:devin-local` | Self-hosted, `devin -p` CLI | Needs self-hosted runner |
| ollama | `agent:ollama` | Self-hosted, Ollama HTTP API | Needs Ollama + self-hosted |
| cursor | `agent:cursor` | Hosted/self-hosted, Cursor CLI | Needs `CURSOR_API_KEY` |
| noop | `agent:noop` | Any | Works (testing only) |

### Security Boundary

- **One GitHub App** = the only authenticated actor. Fighters never hold credentials.
- **G3 guard** (`src/guard/untrusted.ts`): untrusted input sanitized before LLM prompts
- **Secret-scan hook** (`src/guard/secretscan.ts`): Fighter output scrubbed for credentials
- **Hard-exclusion regex** (`isExcludedScope()` in `src/dispatch/adapter.ts`): Fighters never touch auth/payment/secret/migration/delete/spend code

## Key Files

| Path | Role |
|---|---|
| `src/config.ts` | Central config — `MANAGER_CMD`, `JUNIOR_CMD`, effort scoping, cost ceilings |
| `src/manager/worker.ts` | Coach worker — decompose, review, dispatch |
| `src/manager/runner.ts` | Coach CLI runner — spawns `MANAGER_CMD`, parses JSON |
| `src/junior/runner.ts` | In-process Fighter runner — spawns `JUNIOR_CMD` |
| `src/referee/` | Referee — outcome routing, pre-filter, claim-checker |
| `src/dispatch/` | Wake-up layer adapters — Devin, Ollama, Cursor, Devin-Local |
| `src/guard/` | Security guards — secret-scan, untrusted-input |
| `src/protocol/` | Labels, messages, branch conventions |
| `src/state/db.ts` | SQLite store — tasks, cost ledger, revision points |
| `src/cost-forecast.ts` | Cost forecast — free vs paid split, budget tracking |
| `scripts/dispatch.ts` | Dispatch router — maps `agent:X` labels to adapters |
| `scripts/fighter-inbox.ts` | Fighter Inbox — reads unread Coach messages |

## Cost Model

- **Open weight Fighters**: ollama, windsurf-kimi, antigravity, devin-local — $0
- **Paid Coach**: manager (Claude) — tracked via `CostLedger` and `costForecast()`
- **Budget ceiling**: `MAX_USD` env var; `costForecast()` logs remaining budget at each review

## Testing

- **Oracle**: `npm run build && npm test` — TypeScript build + Vitest
- **CI**: GitHub Actions `build-test` job — required check on all PRs
- **Done-contract**: every PR must pass build + test before the Referee approves
