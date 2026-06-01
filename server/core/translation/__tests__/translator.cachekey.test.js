import { describe, it, expect } from 'vitest';
import Translator from '../Translator.js';

const stubCache = () => { const m = new Map(); return {
  async get(k){return m.has(k)?m.get(k):null;}, async set(k,v){m.set(k,v);},
  getStats(){return{};}, async clear(){m.clear();}, _m:m }; };

it('cache key changes with model (no stale cross-model hit)', async () => {
  const cache = stubCache();
  const ai1 = { async translate(){return 'A';} };
  const ai2 = { async translate(){return 'B';} };
  const t1 = new Translator(ai1, cache, { model: 'm1' });
  const t2 = new Translator(ai2, cache, { model: 'm2' });
  const r1 = await t1.translateText('shalom', 'he', 'en');
  const r2 = await t2.translateText('shalom', 'he', 'en');
  expect(r1.text).toBe('A');
  expect(r2.text).toBe('B'); // different model => cache miss, not stale 'A'
});
