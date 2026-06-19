/**
 * `foreman init` — scaffold loop-budget.md + loop-run-log.md in a target repo.
 *
 * Usage: npx foreman init [--dir <path>]
 *
 * Writes both files with sane defaults if they don't exist.
 * Idempotent: re-running only fills gaps (existing files are not overwritten).
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const LOOP_BUDGET_MD = `# Loop Budget

> Cost ceilings for the Foreman loop. The referee checks these before every merge.
> Edit the values below — they override the env defaults when present.

## Cost ceilings

| Ceiling | Default | Description |
|---|---|---|
| MAX_USD | (none) | Maximum spend per loop run, in USD. The loop halts when exceeded. |
| MAX_TOKENS | (none) | Maximum total tokens per loop run. |
| MAX_TOKENS_5H | (none) | Maximum total tokens in any 5-hour rolling window. |
| MAX_QUEUE | 5 | Maximum tasks queued at once. |

## Agent limits

| Agent | Max concurrent | Stale warn (min) |
|---|---|---|
| ollama | 3 | 0 (monitored directly) |
| windsurf-kimi | 1 | 15 |
| claude | 1 | 0 (monitored directly) |

## Notes

- Free Fighters (ollama, windsurf-kimi, antigravity) cost $0 — only the Coach (manager) costs money.
- Set MAX_USD to a low value (e.g. 1.0) when experimenting; raise it once you trust the loop.
- The CostForecast (M4-3) logs remaining budget at each review cycle.
`;

const LOOP_RUN_LOG_MD = `# Loop Run Log

> Memory of what happened in each loop iteration. "The model forgets, the repo doesn't."
> The loop appends one entry per dispatch cycle. Do not edit manually unless correcting an entry.

## Format

Each entry is a markdown section:

\`\`\`
## <timestamp> — Issue #<N> — <agent>

- **Status**: queued | claimed | in_review | changes_requested | approved | done | failed | stopped
- **PR**: #<pr-number> (if created)
- **Cost**: $<usd> (<tokens> tokens)
- **Rounds**: <N>
- **Outcome**: <one-line summary>
\`\`\`

## Entries

<!-- The loop appends entries below this line. Do not remove this marker. -->
`;

export interface InitOptions {
  dir?: string;
}

export interface InitResult {
  budgetPath: string;
  logPath: string;
  budgetCreated: boolean;
  logCreated: boolean;
}

/**
 * Scaffold loop-budget.md and loop-run-log.md in the target directory.
 * Idempotent: existing files are never overwritten.
 */
export function initLoop(opts: InitOptions = {}): InitResult {
  const dir = resolve(opts.dir ?? ".");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const budgetPath = join(dir, "loop-budget.md");
  const logPath = join(dir, "loop-run-log.md");

  const budgetCreated = !existsSync(budgetPath);
  const logCreated = !existsSync(logPath);

  if (budgetCreated) writeFileSync(budgetPath, LOOP_BUDGET_MD, "utf8");
  if (logCreated) writeFileSync(logPath, LOOP_RUN_LOG_MD, "utf8");

  return { budgetPath, logPath, budgetCreated, logCreated };
}

/** CLI entry point — called when the user runs `foreman init`. */
export function runInitCli(args: string[]): void {
  const dirIdx = args.indexOf("--dir");
  const dir = dirIdx >= 0 && dirIdx + 1 < args.length ? args[dirIdx + 1] : undefined;

  const result = initLoop({ dir });

  if (result.budgetCreated) {
    console.log(`✅ Created ${result.budgetPath}`);
  } else {
    console.log(`⏭️  ${result.budgetPath} already exists — skipped`);
  }

  if (result.logCreated) {
    console.log(`✅ Created ${result.logPath}`);
  } else {
    console.log(`⏭️  ${result.logPath} already exists — skipped`);
  }

  console.log("\nForeman is initialized. Next steps:");
  console.log("  1. Edit loop-budget.md to set your cost ceilings");
  console.log("  2. Set MANAGER_CMD and JUNIOR_CMD env vars (or use defaults)");
  console.log("  3. Label an issue with 'epic' to trigger decomposition");
}
