// packages/api/src/worker.js
// Worker-процесс: подписывается на Bull-очередь и обрабатывает задания.
// Запускается отдельно от API: `npm run worker -w @hdt/api`.
// Сборка пайплайна (DocumentAnalyzer/TextExtractor/Translator/DocumentGenerator)
// будет добавлена в P1; в P0 — каркас и регистрация процессора.

const env = require('./config/env');
const { pingRedisOrExit, getQueue } = require('./queue');

async function bootstrap() {
  await pingRedisOrExit();
  const queue = getQueue();

  queue.process('translate', env.QUEUE_CONCURRENCY, async (job) => {
    // P0 stub: подтверждаем, что задание дошло до worker'а.
    // В P1 здесь будет полный пайплайн (см. ARCHITECTURE.md §2).
    // eslint-disable-next-line no-console
    console.log(`[worker] picked up job ${job.id}`, job.data);
    await job.progress(100);
    return { stub: true, jobId: job.id };
  });

  // eslint-disable-next-line no-console
  console.log(`[worker] HDT worker started (concurrency=${env.QUEUE_CONCURRENCY})`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[worker] bootstrap failed:', err);
    process.exit(1);
  });
}

module.exports = { bootstrap };
