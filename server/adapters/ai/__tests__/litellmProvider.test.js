import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiteLLMProvider from '../LiteLLMProvider.js';

const okJson = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body)
});

let provider;

beforeEach(() => {
  provider = new LiteLLMProvider({
    baseURL: 'http://litellm:4000',
    apiKey: 'sk-master',
    model: 'translate'
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LiteLLMProvider', () => {
  it('translate posts to chat/completions with model alias and returns trimmed content', async () => {
    global.fetch = vi.fn(async () => okJson({ choices: [{ message: { content: ' hello ' } }] }));

    const out = await provider.translate('shalom', 'he', 'en');

    expect(out).toBe('hello');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://litellm:4000/chat/completions');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body);
    expect(body.model).toBe('translate');
    expect(body.messages[1].content).toBe('shalom');
    expect(opts.headers['Authorization']).toBe('Bearer sk-master');
  });

  it('translate throws on non-ok response', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }));

    await expect(provider.translate('x', 'he', 'en')).rejects.toThrow();
  });

  it('healthCheck reflects /health status', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    expect(await provider.healthCheck()).toBe(true);

    global.fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    expect(await provider.healthCheck()).toBe(false);

    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe('http://litellm:4000/health');
  });
});
