import { startJunior } from '../junior/runner.js';
import type { FighterDriver, FighterDriverDeps } from './fighter.js';
import { config } from '../config.js';
export function createClaudeJuniorDriver(deps: FighterDriverDeps): FighterDriver {
  const tick = startJunior(deps.store, deps.auth, deps.log);
  return { name: config.juniorAgent, tick };
}
