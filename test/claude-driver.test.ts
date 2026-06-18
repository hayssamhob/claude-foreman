import { describe } from 'vitest';
import { Store } from '../src/state/db.js';
import { createClaudeJuniorDriver } from '../src/drivers/claude.js';
import { conformanceTests } from './driver.conformance.js';
import type { Octokit } from '../src/octokit.js';

process.env.JUNIOR_ENABLED = '0';
const store = new Store(':memory:');
const auth = async () => ({}) as unknown as Octokit;
const driver = createClaudeJuniorDriver({ store, auth, log: () => {} });
describe('ClaudeJuniorDriver conformance', () => conformanceTests(driver));
