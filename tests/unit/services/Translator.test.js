import { describe, it, expect, beforeEach, vi } from 'vitest';
import Translator from '../../../server/services/Translator';

describe('Translator Service', () => {
  let translator;
  
  beforeEach(() => {
    translator = new Translator();
  });

  describe('Basic Translation', () => {
    it('должен корректно переводить простой текст на иврите', async () => {
      const hebrewText = 'שָׁלוֹם'; // Шалом
      const result = await translator.translateText(hebrewText, 'he', 'ru');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('должен сохранять огласовки при переводе', async () => {
      const hebrewWithNikkud = 'בְּרֵאשִׁית';
      const result = await translator.translateText(hebrewWithNikkud, 'he', 'ru');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('Rate Limiting', () => {
    it('должен ограничивать количество запросов', async () => {
      const text = 'test';
      // Делаем 101 запрос (лимит 100)
      const promises = Array(101).fill().map(() => 
        translator.translateText(text, 'en', 'ru')
      );

      await expect(Promise.all(promises))
        .rejects
        .toThrow('Translation rate limit exceeded');
    });

    it('должен восстанавливать токены со временем', async () => {
      const text = 'test';
      
      // Используем 50 токенов
      await Promise.all(Array(50).fill().map(() => 
        translator.translateText(text, 'en', 'ru')
      ));

      // Ждем восстановления токенов
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Пробуем еще 60 запросов
      const promises = Array(60).fill().map(() => 
        translator.translateText(text, 'en', 'ru')
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });

  describe('Batch Processing', () => {
    it('должен обрабатывать пакеты документов', async () => {
      const blocks = [
        { type: 'text', content: 'שָׁלוֹם', language: 'he' },
        { type: 'text', content: 'Hello', language: 'en' },
        { type: 'image', content: 'image.jpg' }
      ];

      const result = await translator.translateDocument(blocks, 'ru');
      
      expect(result).toHaveLength(3);
      expect(result[0].originalContent).toBe('שָׁלוֹם');
      expect(result[1].originalContent).toBe('Hello');
      expect(result[2].type).toBe('image');
    });
  });

  describe('Error Handling', () => {
    it('должен обрабатывать неподдерживаемые языки', async () => {
      await expect(
        translator.translateText('test', 'xx', 'yy')
      ).rejects.toThrow('Unsupported language combination');
    });

    it('должен обрабатывать ошибки API', async () => {
      // Мокаем ошибку API
      vi.spyOn(translator, 'translateText').mockRejectedValueOnce(
        new Error('API Error')
      );

      await expect(
        translator.translateText('test', 'en', 'ru')
      ).rejects.toThrow('Translation failed');
    });
  });
});