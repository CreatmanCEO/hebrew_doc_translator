import { describe, it, expect } from 'vitest';
import { loadConfig } from '../env.js';

describe('loadConfig', () => {
  it('throws when OPENROUTER_API_KEY is missing in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/OPENROUTER_API_KEY/);
  });

  it('returns defaults in development', () => {
    const cfg = loadConfig({ NODE_ENV: 'development', OPENROUTER_API_KEY: 'sk-test' });
    expect(cfg.PORT).toBe(3001);
    expect(cfg.REDIS_HOST).toBe('localhost');
    expect(cfg.MAX_FILE_MB).toBe(25);
  });
});
