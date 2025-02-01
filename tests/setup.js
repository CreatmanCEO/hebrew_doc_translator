import { vi, beforeAll, afterEach, afterAll } from 'vitest';
import { __mockConfig } from '@vitalets/google-translate-api';

// Настройка моков для всех тестов
beforeAll(() => {
  // Инициализация глобальных моков
  vi.mock('@vitalets/google-translate-api');
  vi.mock('hebrew-transliteration', () => ({
    transliterate: (text) => text
  }));
});

// Сброс состояния моков после каждого теста
afterEach(() => {
  __mockConfig.reset();
  vi.clearAllMocks();
});

// Очистка после всех тестов
afterAll(() => {
  vi.resetModules();
});