const { describe, it, expect, beforeEach, jest } = require('@jest/globals');
const Translator = require('../../../server/services/Translator');
const { mockState, translate, transliterate, resetState } = require('../../../server/services/__mocks__/translator-services');

jest.mock('@vitalets/google-translate-api', () => ({
  translate
}));

jest.mock('hebrew-transliteration', () => ({
  transliterate
}));

describe('Translator Service', () => {
  let translator;

  beforeEach(() => {
    translator = new Translator();
    resetState();
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
    beforeEach(() => {
      mockState.rateLimitExceeded = false;
    });

    it('должен ограничивать количество запросов', async () => {
      mockState.rateLimitExceeded = true;
      
      const promises = Array(10).fill(null).map(() => 
        translator.translateText('test', 'he', 'en')
      );

      await expect(Promise.all(promises))
        .rejects
        .toThrow('Translation rate limit exceeded');
    });

    it('должен восстанавливать токены со временем', async () => {
      mockState.delay = 50;
      
      const promises = Array(5).fill(null).map(() => 
        translator.translateText('test', 'en', 'ru')
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      
      mockState.delay = 0;
    }, 10000);
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
      expect(result[0].content).toBe('Hello');
      expect(result[1].originalContent).toBe('Hello');
      expect(result[2].type).toBe('image');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockState.shouldFail = false;
    });

    it('должен обрабатывать неподдерживаемые языки', async () => {
      await expect(
        translator.translateText('test', 'xx', 'en')
      ).rejects.toThrow('Unsupported language combination');
    });

    it('должен обрабатывать ошибки API', async () => {
      mockState.shouldFail = true;
      
      await expect(
        translator.translateText('test', 'en', 'ru')
      ).rejects.toThrow('Translation failed');
    });
  });
});