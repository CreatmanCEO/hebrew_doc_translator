const fs = require('fs').promises;
const path = require('path');

module.exports = async () => {
  // Останавливаем Redis контейнер
  if (global.__REDIS_CONTAINER__) {
    await global.__REDIS_CONTAINER__.stop();
  }

  // Очищаем временную директорию
  const tempDir = path.join(__dirname, '../../temp');
  try {
    await fs.rm(tempDir, { recursive: true });
  } catch (error) {
    console.error('Error cleaning up temp directory:', error);
  }

  // Сбрасываем переменные окружения
  delete process.env.REDIS_HOST;
  delete process.env.REDIS_PORT;
  delete process.env.UPLOAD_DIR;
};