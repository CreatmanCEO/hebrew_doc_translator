const { cleanEnv, str, num } = require('envalid');

/**
 * Custom reporter that aggregates all missing/invalid env vars into a single
 * Error and throws it, instead of envalid's default behaviour (logging and
 * calling process.exit). Throwing makes the validation testable and lets the
 * caller (server bootstrap) fail fast with a clear message.
 *
 * @param {{ errors: Record<string, Error>, env: unknown }} opts
 */
function throwingReporter({ errors }) {
  const keys = Object.keys(errors);
  if (keys.length === 0) return;

  const details = keys
    .map((key) => `  - ${key}: ${errors[key] && errors[key].message ? errors[key].message : 'invalid'}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${details}`);
}

/**
 * Load and validate configuration from an env-like object.
 *
 * Pure function: the env source is passed in (defaults to process.env) so the
 * behaviour is fully testable and there is no top-level process.env read.
 *
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {object} cleaned, validated config
 * @throws {Error} when validation fails (e.g. OPENROUTER_API_KEY missing in production)
 */
function loadConfig(env = process.env) {
  return cleanEnv(
    env,
    {
      NODE_ENV: str({ default: 'development' }),
      PORT: num({ default: 3001 }),

      REDIS_HOST: str({ default: 'localhost' }),
      REDIS_PORT: num({ default: 6379 }),
      REDIS_PASSWORD: str({ default: '' }),

      // Required in production (no `default`), but falls back to '' in any
      // non-production NODE_ENV via `devDefault`. envalid treats a var with
      // only a devDefault as required when NODE_ENV === 'production'.
      OPENROUTER_API_KEY: str({ devDefault: '' }),
      GEMINI_API_KEY: str({ default: '' }),

      LITELLM_BASE_URL: str({ default: 'http://litellm:4000' }),
      LITELLM_MASTER_KEY: str({ default: '' }),
      TRANSLATE_MODEL: str({ default: 'translate' }),

      CORS_ORIGINS: str({ default: '' }),

      MAX_FILE_MB: num({ default: 25 }),
      MAX_PAGES: num({ default: 50 }),

      RATE_LIMIT_MAX: num({ default: 30 }),
      RATE_LIMIT_WINDOW_MS: num({ default: 900000 }),

      DOWNLOAD_TTL_MS: num({ default: 900000 }),
    },
    { reporter: throwingReporter },
  );
}

module.exports = { loadConfig };
