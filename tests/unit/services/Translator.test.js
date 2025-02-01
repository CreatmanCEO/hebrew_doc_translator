import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Translator from '../../../server/services/Translator';
import { __mockConfig } from '@vitalets/google-translate-api';

describe('Translator Service', () => {
  let translator;

  beforeEach(() => {
    translator = new Translator();
    __mockConfig.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Translation', () => {
    it('должен корректно переводить простой текст на иврите', async () => {
      const result = await translator.translateText('שלום', 'he', 'en');
      expect(result).toBe('Hello');
    });

    it('должен сохранять огласовки при переводе', async () => {
      const result = await translator.translateText('שָׁלוֹם', 'he', 'en');
      expect(result).toBe('Hello');
    });
  });

  describe('Rate Limiting', () => {
    it('должен ограничивать количество запросов', async () => {
      __mockConfig.setRateLimitExceeded(true);

      const promises = Array(10).fill(null).map(() => 
        translator.translateText('test', 'he', 'en')
      );

      await expect(Promise.all(promises))
        .rejects
        .toThrow('Translation rate limit exceeded');
    });

    it('должен восстанавливать токены со временем', async () => {
      // Устанавливаем маленькую задержку для теста
      __mockConfig.setDelay(50);
      
      const text = 'test';
      const promises = Array(5).fill(null).map(() => 
        translator.translateText(text, 'en', 'ru')
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();
      
      __mockConfig.setDelay(0);
    });
  });

  describe('Batch Processing', () => {
    it('должен обрабатывать пакеты документов', async () => {
      const blocks = [
        { type: 'text', content: 'שָׁלוֹם', language: 'he' },
        { type: 'text', content: 'Hello', language: 'en' },
        { type: 'image', content: 'test.jpg' }
      ];

      const result = await translator.translateDocument(blocks, 'en');

      expect(result).toHaveLength(3);
      expect(result[0].originalContent).toBe('שָׁלוֹם');
      expect(result[1].originalContent).toBe('Hello');
      expect(result[2].type).toBe('image');
    });
  });

  describe('Error Handling', () => {
    it('должен обрабатывать неподдерживаемые языки', async () => {
      await expect(
        translator.translateText('test', 'xx', 'en')
      ).rejects.toThrow('Unsupported language combination');
    });

    it('должен обрабатывать ошибки API', async () => {
      __mockConfig.setShouldFail(true);
      
      await expect(
        translator.translateText('test', 'en', 'ru')
      ).rejects.toThrow('Translation failed');
    });
  });
});