import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { TextDecoder, TextEncoder } from 'util';

// Мокаем глобальные объекты браузера
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

// Мокаем Redis для тестов
vi.mock('ioredis', () => {
  const Redis = vi.fn();
  Redis.prototype.get = vi.fn();
  Redis.prototype.set = vi.fn();
  Redis.prototype.del = vi.fn();
  Redis.prototype.hmset = vi.fn();
  Redis.prototype.hgetall = vi.fn();
  return Redis;
});

// Мокаем Bull для тестов
vi.mock('bull', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      add: vi.fn(),
      process: vi.fn(),
      on: vi.fn(),
    })),
  };
});

// Мокаем файловую систему
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
}));

// Мокаем window.fs для браузера
global.window = {
  ...global.window,
  fs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
};

// Очистка моков после каждого теста
afterEach(() => {
  vi.clearAllMocks();
});