const { GenericContainer } = require('testcontainers');
const path = require('path');
const fs = require('fs').promises;

// Создаем временную директорию для тестовых файлов
async function createTempDirectory() {
  const tempDir = path.join(__dirname, '../../temp');
  try {
    await fs.access(tempDir);
  } catch {
    await fs.mkdir(tempDir);
  }
  return tempDir;
}

// Запускаем Redis в контейнере для тестов
async function startRedisContainer() {
  const container = await new GenericContainer('redis:latest')
    .withExposedPorts(6379)
    .start();

  process.env.REDIS_HOST = container.getHost();
  process.env.REDIS_PORT = container.getMappedPort(6379);

  return container;
}

module.exports = async () => {
  // Создаем временную директорию
  const tempDir = await createTempDirectory();
  process.env.UPLOAD_DIR = tempDir;
  
  // Запускаем Redis
  const redisContainer = await startRedisContainer();
  global.__REDIS_CONTAINER__ = redisContainer;
  
  // Другие настройки тестового окружения
  process.env.NODE_ENV = 'test';
  process.env.PORT = 3001;
};