import { vi } from 'vitest';
import { mockConfig } from './__mocks__/translationService';

// Определяем моки до импорта тестируемых модулей
vi.mock('@vitalets/google-translate-api', () => {
  return {
    translate: vi.fn().mockImplementation(async (text, options) => {
      // Импортируем реализацию мока динамически
      const { translate } = await import('./__mocks__/translationService');
      return translate(text, options);
    })
  };
});

vi.mock('hebrew-transliteration', () => {
  return {
    transliterate: vi.fn().mockImplementation((text) => {
      // Импортируем реализацию мока динамически
      const { transliterate } = require('./__mocks__/translationService');
      return transliterate(text);
    })
  };
});

// Очистка состояния моков после каждого теста
afterEach(() => {
  mockConfig.reset();
  vi.clearAllMocks();
});