import { describe, it, expect, beforeEach } from 'vitest';
import Translator from '../../server/services/Translator';
import { transliterate } from 'hebrew-transliteration';

describe('Translator Service', () => {
  let translator;

  beforeEach(() => {
    translator = new Translator();
  });

  // Тестирование перевода простого текста
  describe('Basic Translation', () => {
    it('should translate simple Hebrew text', async () => {
      const text = 'שלום';
      const result = await translator.translateText(text, 'he', 'en');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle empty text', async () => {
      const text = '';
      await expect(translator.translateText(text, 'he', 'en'))
        .rejects
        .toThrow('Translation failed');
    });

    it('should validate language codes', async () => {
      const text = 'Hello';
      await expect(translator.translateText(text, 'xx', 'en'))
        .rejects
        .toThrow('Unsupported language combination');
    });
  });

  // Тестирование обработки смешанного контента
  describe('Mixed Content Handling', () => {
    it('should preserve non-Hebrew parts in mixed text', async () => {
      const text = 'שלום! Hello123';
      const result = await translator.translateText(text, 'he', 'en');
      expect(result).toMatch(/Hello123/);
    });

    it('should handle numbers and punctuation', async () => {
      const text = 'מספר: 12345';
      const result = await translator.translateText(text, 'he', 'en');
      expect(result).toMatch(/12345/);
    });
  });

  // Тестирование форматирования документа
  describe('Document Translation', () => {
    it('should translate document blocks', async () => {
      const blocks = [
        { type: 'text', content: 'שלום', language: 'he' },
        { type: 'text', content: 'Hello', language: 'en' }
      ];

      const result = await translator.translateDocument(blocks, 'en');
      
      expect(result).toHaveLength(2);
      expect(result[0].originalContent).toBe('שלום');
      expect(result[1].content).toBe('Hello');
    });

    it('should preserve non-text blocks', async () => {
      const blocks = [
        { type: 'text', content: 'שלום', language: 'he' },
        { type: 'image', content: 'image.jpg' }
      ];

      const result = await translator.translateDocument(blocks, 'en');
      
      expect(result).toHaveLength(2);
      expect(result[1].type).toBe('image');
      expect(result[1].content).toBe('image.jpg');
    });
  });

  // Тестирование rate limiting
  describe('Rate Limiting', () => {
    it('should handle rate limits', async () => {
      const text = 'שלום';
      const promises = Array(150).fill(null).map(() => 
        translator.translateText(text, 'he', 'en')
      );

      await expect(Promise.all(promises))
        .rejects
        .toThrow('Translation rate limit exceeded');
    });

    it('should recover after rate limit cooldown', async () => {
      const text = 'שלום';
      
      // Ждем 60 секунд для сброса лимита
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      const result = await translator.translateText(text, 'he', 'en');
      expect(result).toBeTruthy();
    });
  });

  // Тестирование обработки ошибок
  describe('Error Handling', () => {
    it('should handle translation service errors', async () => {
      const invalidText = null;
      await expect(translator.translateText(invalidText, 'he', 'en'))
        .rejects
        .toThrow('Translation failed');
    });

    it('should validate language pairs', () => {
      expect(translator.validateLanguage('he')).toBe(true);
      expect(translator.validateLanguage('en')).toBe(true);
      expect(translator.validateLanguage('xx')).toBe(false);
    });
  });
});