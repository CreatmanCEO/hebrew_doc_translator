// packages/api/src/index.js
// Точка входа API-процесса. Не содержит логики worker'а — он стартует
// отдельной командой `npm run worker -w @hdt/api` (см. ARCHITECTURE.md §1).

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const { pingRedisOrExit, getQueue } = require('./queue');
const { errorHandler } = require('./middleware/errorHandler');
const translateRouter = require('./api/translate');
const healthRouter = require('./api/health');

async function bootstrap() {
  await pingRedisOrExit();

  const app = express();
  const server = http.createServer(app);
  const io = socketIO(server, {
    cors: {
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    },
  });

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    })
  );
  app.use(express.json());

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
    })
  );

  app.set('io', io);

  app.use('/api', healthRouter);
  app.use('/api', translateRouter);

  app.use(errorHandler);

  // Warm-up: ленивая фабрика создаст очередь, чтобы упасть рано
  // при ошибке конфигурации Bull.
  getQueue();

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] HDT API listening on :${env.PORT} (NODE_ENV=${env.NODE_ENV})`);
  });

  return { app, server, io };
}

if (require.main === module) {
  bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[api] bootstrap failed:', err);
    process.exit(1);
  });
}

module.exports = { bootstrap };
