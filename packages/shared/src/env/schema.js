// @hdt/shared/env/schema — zod-схема переменных окружения (см. ARCHITECTURE.md §6).
// Импортируется из packages/api/src/config/env.js и из CI-инструментов.
const { z } = require('zod');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),

    // Redis — обязателен в проде; в test допускаем mock через REDIS_MOCK=1
    REDIS_URL: z.string().url().optional(),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_TLS: z.coerce.boolean().default(false),
    REDIS_MOCK: z.coerce.boolean().default(false),

    // LLM
    LLM_PROVIDER: z.enum(['openrouter', 'anthropic', 'deepseek', 'gemini']).default('openrouter'),
    LLM_MODEL_CASCADE: z
      .string()
      .default(
        'google/gemini-2.0-flash-exp:free,deepseek/deepseek-chat,google/gemini-2.0-flash'
      ),
    LLM_QUALITY_MODE: z.enum(['standard', 'premium']).default('standard'),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
    ANTHROPIC_API_KEY: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),

    // OCR
    OCR_CLOUD_PROVIDER: z.enum(['google', 'azure', 'none']).default('google'),
    OCR_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.75),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    AZURE_VISION_ENDPOINT: z.string().url().optional(),
    AZURE_VISION_KEY: z.string().optional(),

    // Лимиты
    MAX_FILE_SIZE_MB: z.coerce.number().default(50),
    RATE_LIMIT_MAX: z.coerce.number().default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
    QUEUE_CONCURRENCY: z.coerce.number().default(5),
  })
  .superRefine((cfg, ctx) => {
    // LLM provider key check (применяется только при наличии production-сценария).
    if (cfg.NODE_ENV === 'production') {
      const need = {
        openrouter: 'OPENROUTER_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        deepseek: 'DEEPSEEK_API_KEY',
        gemini: 'GEMINI_API_KEY',
      }[cfg.LLM_PROVIDER];
      if (!cfg[need]) {
        ctx.addIssue({
          code: 'custom',
          path: [need],
          message: `${need} required for LLM_PROVIDER=${cfg.LLM_PROVIDER}`,
        });
      }
      if (cfg.OCR_CLOUD_PROVIDER === 'google' && !cfg.GOOGLE_APPLICATION_CREDENTIALS) {
        ctx.addIssue({
          code: 'custom',
          path: ['GOOGLE_APPLICATION_CREDENTIALS'],
          message: 'GOOGLE_APPLICATION_CREDENTIALS required for OCR_CLOUD_PROVIDER=google',
        });
      }
      if (
        cfg.OCR_CLOUD_PROVIDER === 'azure' &&
        !(cfg.AZURE_VISION_ENDPOINT && cfg.AZURE_VISION_KEY)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['AZURE_VISION_ENDPOINT'],
          message: 'AZURE_VISION_ENDPOINT and AZURE_VISION_KEY required for OCR_CLOUD_PROVIDER=azure',
        });
      }
    }
  });

module.exports = { envSchema: schema };
