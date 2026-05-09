const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');
const ProgressTracker = require('./middleware/progressTracker');
const translateRouter = require('./api/translate');

// Создаем express приложение
const app = express();
const server = http.createServer(app);

// Настраиваем Socket.IO
const io = socketIO(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  }
});

// Базовые middleware
app.set('trust proxy', 1);
// app.use(helmet()); // Временно отключаем helmet

// Настраиваем CORS
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Content-Length", "Authorization"],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100 // максимум 100 запросов с одного IP
});
app.use(limiter);

// Сохраняем io для использования в маршрутах
app.set('io', io);

// Инициализация ProgressTracker
const progressTracker = new ProgressTracker(io);
progressTracker.setupSocketHandlers();
app.set('progressTracker', progressTracker);

// Делаем app доступным глобально для очереди
global.app = app;

// Статические файлы
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API маршруты
app.use('/api', translateRouter);

// Базовые middleware - после маршрутов API
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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