import { expect, it } from 'vitest';
import type { FighterDriver } from '../src/drivers/fighter.js';
export function conformanceTests(driver: FighterDriver): void {
  it('has a non-empty name', () => { expect(driver.name.length).toBeGreaterThan(0); });
  it('tick() returns a Promise', () => { const r = driver.tick(); expect(r).toBeInstanceOf(Promise); return r; });
  it('concurrent tick() calls do not throw', async () => { await expect(Promise.all([driver.tick(), driver.tick()])).resolves.toBeDefined(); });
}
