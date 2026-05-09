// packages/api/src/queue.js
// Bull-очередь + fail-fast Redis ping. Импорт этого модуля НЕ создаёт
// очередь как side effect — конструируется только через getQueue().
// См. ARCHITECTURE.md §1, §6.

const Queue = require('bull');
const Redis = require('ioredis');
const env = require('./config/env');

const QUEUE_NAME = 'translation';
const PING_TIMEOUT_MS = 5000;

let queueInstance = null;

function buildRedisOptions() {
  if (env.REDIS_URL) {
    return env.REDIS_URL;
  }
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    tls: env.REDIS_TLS ? {} : undefined,
  };
}

/**
 * Проверяет доступность Redis с таймаутом. При недоступности — process.exit(1).
 * Используется при bootstrap api/worker процессов.
 */
async function pingRedisOrExit() {
  const opts = buildRedisOptions();
  const client = typeof opts === 'string' ? new Redis(opts, { lazyConnect: true }) : new Redis({ ...opts, lazyConnect: true });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('REDIS_PING_TIMEOUT')), PING_TIMEOUT_MS);
  });

  try {
    await Promise.race([client.connect().then(() => client.ping()), timeout]);
    await client.quit().catch(() => {});
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[queue] Redis недоступен: ${err.message}. Завершаюсь.`);
    process.exit(1);
  }
}

/**
 * Ленивая фабрика. Очередь создаётся только при первом вызове —
 * импорт модуля сам по себе ничего не запускает.
 */
function getQueue() {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, { redis: buildRedisOptions() });
  }
  return queueInstance;
}

async function closeQueue() {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}

module.exports = { getQueue, closeQueue, pingRedisOrExit, QUEUE_NAME };
