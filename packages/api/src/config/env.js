// packages/api/src/config/env.js
// Загружает .env / .env.local и валидирует через zod-схему из @hdt/shared.
// Fail-fast: при невалидном env процесс завершается кодом 1 (ARCHITECTURE.md §6).

const path = require('path');
const dotenv = require('dotenv');

// .env.local имеет приоритет над .env (override=true).
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const { envSchema } = require('@hdt/shared');

const result = envSchema.safeParse(process.env);
if (!result.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid configuration:', JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

module.exports = result.data;
