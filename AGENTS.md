# AGENTS.md — Rules for AI agents working on claude-foreman

## Mandatory workflow for every task

1. **Read the issue spec** — `gh issue view <N>` for the grilled brief + acceptance criteria
2. **Create a branch** — `feat/issue-<N>-<slug>` or `fix/issue-<N>-<slug>`
3. **Implement** — follow existing code conventions, check imports/interfaces
4. **Test** — `npm run build && npm test` must be green before pushing
5. **Open a PR** — body must contain `Closes #N`
6. **Post the done-signal** — `gh pr comment <PR> --body "@hayssamhob ✅ #N done — <one sentence>"`
   - This is MANDATORY. The Coach loop gates on it. Without it, automerge never fires.
   - See `gotchas.md` G7 for details.

## Done-contract checklist

For every PR, before you consider the task done:

- [ ] Branch created with correct naming
- [ ] Code follows existing conventions (check neighboring files)
- [ ] `npm run build` passes (TypeScript compiles)
- [ ] `npm test` passes (all tests green)
- [ ] PR opened with `Closes #N` in the body
- [ ] **Done-signal comment posted on the PR**: `@hayssamhob ✅ #N done — <sentence>`

## Key files

- `gotchas.md` — project-specific pitfalls (READ THIS, every mistake is documented here)
- `SPEC.md` — the full specification (§5.7, §6.3, §8 for acceptance criteria)
- `src/dispatch/adapter.ts` — the `FighterAdapter` interface that all adapters implement
- `src/protocol/labels.ts` — label conventions (`agent:X`, `status:X`, `trust:L1/L2/L3`)
- `src/automerge.ts` — the merge gate (CI, threads, hold, trust, preview)

## Test framework

- **Vitest** (not Jest) — use `vi.mock`, `vi.fn`, `vi.stubGlobal`, `vi.stubEnv`
- Run: `npm test` or `npx vitest run <file>`

## CI

- GitHub Actions matrix: ubuntu-latest, macos-latest, windows-latest

## Resolving PR review threads

GitHub PR review threads do NOT auto-resolve when you push fixes. Use the GraphQL API:

```bash
gh api graphql -f query='mutation { resolveReviewThread(input:{threadId:"THREAD_ID"}) { thread { id isResolved } } }'
```
