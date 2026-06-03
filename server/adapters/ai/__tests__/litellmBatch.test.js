import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiteLLMProvider from '../LiteLLMProvider.js';

const makeRes = (body, { cost = '0.0001' } = {}) => ({
  ok: true, status: 200,
  headers: { get: (h) => (h.toLowerCase() === 'x-litellm-response-cost' ? cost : null) },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let p;
beforeEach(() => { p = new LiteLLMProvider({ baseURL: 'http://litellm:4000', apiKey: 'sk', model: 'translate' }); });
afterEach(() => vi.restoreAllMocks());

describe('LiteLLMProvider.translateBatchAligned', () => {
  it('parses items + usage from a batch response', async () => {
    global.fetch = vi.fn(async () => makeRes({
      model: 'gemini/gemini-2.0-flash',
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
      choices: [{ message: { content: JSON.stringify({ items: [
        { id: 'b0s0', target: 'Hello world', align: [{ src: [0], tgt: [0] }] }
      ] }) } }],
    }));
    const out = await p.translateBatchAligned([{ id: 'b0s0', source: 'שלום עולם', srcTokens: ['שלום','עולם'] }], 'he', 'en');
    expect(out.items).toHaveLength(1);
    expect(out.items[0].target).toBe('Hello world');
    expect(out.usage.model).toBe('gemini/gemini-2.0-flash');
    expect(out.usage.totalTokens).toBe(140);
    expect(out.usage.costUsd).toBeCloseTo(0.0001);
    expect(global.fetch.mock.calls[0][0]).toBe('http://litellm:4000/chat/completions');
  });

  it('skips malformed items, keeps valid ones', async () => {
    global.fetch = vi.fn(async () => makeRes({
      usage: {}, choices: [{ message: { content: JSON.stringify({ items: [
        { id: 'b0s0', target: 'ok' }, { id: 'b0s1' /* no target */ }, { target: 'no id' }
      ] }) } }],
    }));
    const out = await p.translateBatchAligned([{ id:'b0s0', source:'a', srcTokens:['a'] }], 'he', 'en');
    expect(out.items).toEqual([{ id: 'b0s0', target: 'ok', align: [] }]);
  });

  it('returns items:[] on non-JSON content (200), does not throw', async () => {
    global.fetch = vi.fn(async () => makeRes({ usage:{}, choices: [{ message: { content: 'not json at all' } }] }));
    const out = await p.translateBatchAligned([{ id:'b0s0', source:'a', srcTokens:['a'] }], 'he', 'en');
    expect(out.items).toEqual([]);
  });

  it('throws on non-ok HTTP', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom', headers: { get: () => null } }));
    await expect(p.translateBatchAligned([{ id:'b0s0', source:'a', srcTokens:['a'] }], 'he', 'en')).rejects.toThrow();
  });
});
