/**
 * coach-claude — Reference CoachDriver adapter.
 *
 * Wraps the existing runManager() call (spawn `config.managerCmd`, unwrap the
 * Claude Code JSON envelope, strip code fences, parse). Claude stays the
 * default; behaviour is identical to the pre-CoachDriver code path.
 *
 * $0 auth: `claude auth login` (Claude.ai account, free tier) or set
 * ANTHROPIC_API_KEY. No extra flags needed — the managerCmd already includes
 * `--output-format json --tools "" --max-turns 1`.
 */
import { runManager } from '../manager/runner.js';
import type { CoachDriver, CoachDriverDeps } from './coach.js';

export function createClaudeCoachDriver(_deps: CoachDriverDeps): CoachDriver {
  return {
    name: 'coach-claude',
    async run<T>(prompt: string): Promise<T> {
      return runManager<T>(prompt);
    },
  };
}
