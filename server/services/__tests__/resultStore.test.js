import { describe, it, expect } from 'vitest';
import { saveResult, getResult, recentUsage } from '../resultStore.js';

describe('resultStore', () => {
  it('save/get round-trip', () => {
    saveResult('tok1', { schemaVersion: 1, blocks: [], usage: { totals: { total: 5 } } }, 1000, 0);
    expect(getResult('tok1', 500)).toMatchObject({ schemaVersion: 1 });
  });

  it('expires after ttl', () => {
    saveResult('tok2', { blocks: [] }, 1000, 0);
    expect(getResult('tok2', 2000)).toBeNull();
  });

  it('missing -> null', () => {
    expect(getResult('nope')).toBeNull();
  });

  it('recentUsage lists docs with usage', () => {
    saveResult('tokU', { blocks: [], usage: { totals: { total: 9 } } }, 100000, 0);
    const r = recentUsage(10).find((x) => x.token === 'tokU');
    expect(r.usage.totals.total).toBe(9);
  });
});
