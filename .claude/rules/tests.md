# Rules for test/ and tests/ directories

These rules apply when editing files under `test/` or `tests/`.

## Framework

- **Vitest**, not Jest. Use `vi.mock`, `vi.fn`, `vi.stubGlobal`, `vi.stubEnv`.
- Run a single file: `npx vitest run <file>`
- Run all: `npm test`

## Test honesty (G8)

Vitest strips TypeScript types without checking them. A test can pass while the build is
broken. **Always run `npm run build` alongside `npm test`** — not just one. If you only
run `npm test`, you will miss type errors.

## What makes a test honest

- It tests the **behavior the issue specifies**, not a trivially-true assertion.
- It would **fail** if the implementation were wrong. If deleting the implementation body
  still passes the test, the test is dishonest — rewrite it.
- It pins the spec's behavior, not the implementation's incidental details.

## Conventions

- Test files live next to the pattern: `test/<name>.test.ts` or `tests/<name>.test.ts`.
- Match the naming and structure of neighboring test files in the same directory.
- Use `describe`/`it` blocks consistent with existing tests.
- Mock at the boundary (external APIs, GitHub calls), not at internal function level.
