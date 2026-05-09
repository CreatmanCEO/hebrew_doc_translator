// vitest globals enabled (см. vitest.config.js).
const { envSchema } = require('./schema');

describe('envSchema', () => {
  it('parses минимальный development env с дефолтами', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.NODE_ENV).toBe('development');
    expect(result.data.PORT).toBe(3001);
    expect(result.data.LLM_PROVIDER).toBe('openrouter');
    expect(result.data.OCR_MIN_CONFIDENCE).toBe(0.75);
  });

  it('падает в production без OPENROUTER_API_KEY', () => {
    const result = envSchema.safeParse({ NODE_ENV: 'production' });
    expect(result.success).toBe(false);
    const flat = result.error.flatten();
    expect(JSON.stringify(flat)).toContain('OPENROUTER_API_KEY');
  });

  it('производственный env с ключами проходит', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'production',
      OPENROUTER_API_KEY: 'sk-test',
      GOOGLE_APPLICATION_CREDENTIALS: './secrets/x.json',
    });
    expect(result.success).toBe(true);
  });

  it('coerces числовые значения из строк', () => {
    const result = envSchema.safeParse({ PORT: '4000', OCR_MIN_CONFIDENCE: '0.9' });
    expect(result.success).toBe(true);
    expect(result.data.PORT).toBe(4000);
    expect(result.data.OCR_MIN_CONFIDENCE).toBe(0.9);
  });
});
