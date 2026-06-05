import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiteLLMProvider from '../LiteLLMProvider.js';

const okJson = (body, cost = '0.0002') => ({
  ok: true, status: 200,
  headers: { get: (h) => (h.toLowerCase() === 'x-litellm-response-cost' ? cost : null) },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let p;
beforeEach(() => { p = new LiteLLMProvider({ baseURL: 'http://litellm:4000', apiKey: 'sk', model: 'translate' }); });
afterEach(() => vi.restoreAllMocks());

describe('LiteLLMProvider.chatJSON', () => {
  it('returns content + usage and posts json_object', async () => {
    global.fetch = vi.fn(async () => okJson({
      model: 'groq/llama-3.3-70b-versatile',
      usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
      choices: [{ message: { content: '{"elements":[]}' } }],
    }));
    const out = await p.chatJSON('sys', 'usr');
    expect(out.content).toBe('{"elements":[]}');
    expect(out.usage.totalTokens).toBe(100);
    expect(out.usage.model).toBe('groq/llama-3.3-70b-versatile');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.model).toBe('translate');
  });

  it('throws on non-ok', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom', headers: { get: () => null } }));
    await expect(p.chatJSON('s', 'u')).rejects.toThrow();
  });
});
