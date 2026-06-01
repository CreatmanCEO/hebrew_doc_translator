const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');
const ProgressTracker = require('./middleware/progressTracker');
const translateRouter = require('./api/translate');
const healthRouter = require('./api/health');

// Создаем express приложение
const app = express();
const server = http.createServer(app);

// Разрешённые источники CORS из env (csv) с dev-фолбэком
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Настраиваем Socket.IO
const io = socketIO(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  }
});

// Безопасность. CSP отключаем на Phase 0 (мешает отдаваемому SPA); ужесточить в Phase 5.
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

// Настраиваем CORS из env
app.use(cors({
  origin: corsOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Content-Length", "Authorization"],
  credentials: true
}));

// Парсеры тела — ДО маршрутов (multipart-загрузки обрабатывает multer в роуте)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (из env)
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100
});
app.use(limiter);

// Сохраняем io для использования в маршрутах
app.set('io', io);

// Регистрируем per-session комнаты (изоляция событий по sessionId)
const { registerRooms } = require('./socket/rooms');
registerRooms(io);

// Инициализация ProgressTracker
const progressTracker = new ProgressTracker(io);
progressTracker.setupSocketHandlers();
app.set('progressTracker', progressTracker);

// Делаем app доступным глобально для очереди
global.app = app;

// API маршруты
app.use('/api', translateRouter);
app.use('/api', healthRouter);

// Отдаём собранный React-клиент (в проде); SPA-fallback на index.html
const clientBuild = path.join(__dirname, '..', 'client', 'build');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

// Обработка ошибок
app.use(errorHandler);

// Запуск сервера
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down server...');
  
  // Закрываем соединение с Redis
  const redis = app.get('progressTracker').redis;
  if (redis) {
    await redis.quit();
  }

  // Закрываем HTTP сервер
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Форсированное закрытие через 10 секунд
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;