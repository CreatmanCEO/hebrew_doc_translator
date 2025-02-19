const { transliterate } = require('hebrew-transliteration');
const { Configuration, OpenAIApi } = require('openai');
const redis = require('../config/redis');
const crypto = require('crypto');
const ApiKeyManager = require('./ApiKeyManager');
const { Translate } = require('@google-cloud/translate').v2;

class Translator {
  constructor() {
    this.supportedLanguages = ['he', 'en', 'ru'];
    this.cacheTTL = process.env.TRANSLATION_CACHE_TTL || 60 * 60 * 24 * 7; // 7 дней
    this.keyManager = new ApiKeyManager();
    // Инициализируем Google Translate API
    this.translator = new Translate({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }

  /**
   * Получение экземпляра OpenAI API с валидным ключом
   * @private
   */
  async getOpenAIInstance() {
    const apiKey = await this.keyManager.getValidOpenAIKey();
    return new OpenAIApi(new Configuration({ apiKey }));
  }

  /**
   * Генерация ключа кэша
   * @private
   */
  generateCacheKey(text, fromLang, targetLang) {
    const hash = crypto
      .createHash('md5')
      .update(`${text}_${fromLang}_${targetLang}`)
      .digest('hex');
    return `translation:${hash}`;
  }

  /**
   * Получение перевода из кэша
   * @private
   */
  async getFromCache(text, from, to) {
    try {
      const cacheKey = this.generateCacheKey(text, from, to);
      const cachedTranslation = await redis.get(cacheKey);
      return cachedTranslation ? JSON.parse(cachedTranslation) : null;
    } catch (error) {
      console.error('Cache retrieval error:', error);
      return null;
    }
  }

  /**
   * Сохранение перевода в кэш
   * @private
   */
  async saveToCache(text, from, to, translation) {
    try {
      const cacheKey = this.generateCacheKey(text, from, to);
      await redis.set(cacheKey, JSON.stringify(translation), 'EX', this.cacheTTL);
    } catch (error) {
      console.error('Cache saving error:', error);
    }
  }

  /**
   * Транслитерация текста с иврита
   * @private
   */
  transliterateHebrew(text) {
    try {
      return transliterate(text);
    } catch (error) {
      console.error('Transliteration error:', error);
      return text;
    }
  }

  /**
   * Перевод через OpenAI
   * @private
   */
  async translateWithOpenAI(text, from, to) {
    const systemPrompt = `You are a professional translator. Translate the following text from ${from} to ${to}. 
    Preserve any formatting, numbers, and special characters. 
    If the text contains technical terms, maintain their accuracy.
    If you're unsure about any part of the translation, maintain the original text in that part.`;

    const transliterated = from === 'he' ? this.transliterateHebrew(text) : text;

    try {
      const openai = await this.getOpenAIInstance();
      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Original (${from}): ${text}\nTransliteration: ${transliterated}` }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      return completion.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('OpenAI translation error:', error);
      
      // Если ошибка связана с API ключом, пробуем получить новый ключ
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('API key error, trying to get a new key...');
        await this.keyManager.findValidKey();
        // Повторяем попытку перевода
        return this.translateWithOpenAI(text, from, to);
      }
      
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  async translateText(text, fromLang, targetLang) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return text;
    }

    // Генерируем ключ кэша
    const cacheKey = this.generateCacheKey(text, fromLang, targetLang);

    try {
      // Проверяем кэш
      const cachedTranslation = await redis.get(cacheKey);
      if (cachedTranslation) {
        return cachedTranslation;
      }

      // Получаем API ключ
      const apiKey = await this.keyManager.getOpenAIKey();
      if (!apiKey) {
        throw new Error('OpenAI API key not available');
      }

      const configuration = new Configuration({
        apiKey: apiKey
      });

      const openai = new OpenAIApi(configuration);

      // Формируем промпт для перевода
      const prompt = `Translate the following text from ${fromLang} to ${targetLang}. Preserve all formatting and special characters:\n\n${text}`;

      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a professional translator. Translate the text exactly as provided, preserving all formatting and special characters." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const translation = completion.data.choices[0].message.content.trim();

      // Сохраняем в кэш
      await redis.set(cacheKey, translation, 'EX', this.cacheTTL);

      return translation;
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  async translateDocument(content, targetLang) {
    try {
      if (typeof content === 'string') {
        // Если content - это строка, переводим её напрямую
        return await this.translateWithOpenAI(content, 'he', targetLang);
      } else if (Array.isArray(content)) {
        // Если content - это массив блоков
        const translatedBlocks = [];

        for (const block of content) {
          if (block.type === 'table') {
            // Обрабатываем таблицу
            const translatedRows = [];
            for (const row of block.rows) {
              const translatedRow = [];
              for (const cell of row) {
                if (cell.needsTranslation) {
                  const translation = await this.translateWithOpenAI(cell.content, 'he', targetLang);
                  translatedRow.push({
                    ...cell,
                    content: translation,
                    needsTranslation: false
                  });
                } else {
                  translatedRow.push(cell);
                }
              }
              translatedRows.push(translatedRow);
            }
            translatedBlocks.push({
              ...block,
              rows: translatedRows
            });
          } else if (block.needsTranslation) {
            // Обрабатываем текстовый блок
            const translation = await this.translateWithOpenAI(block.content, 'he', targetLang);
            translatedBlocks.push({
              ...block,
              content: translation,
              needsTranslation: false
            });
          } else {
            // Блок не требует перевода
            translatedBlocks.push(block);
          }
        }

        return translatedBlocks;
      } else {
        throw new Error('Неподдерживаемый формат содержимого');
      }
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error(`Ошибка перевода: ${error.message}`);
    }
  }

  splitIntoChunks(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    const sentences = text.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxLength) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  validateLanguage(lang) {
    return this.supportedLanguages.includes(lang);
  }

  /**
   * Очистка кэша переводов
   */
  async clearCache() {
    try {
      const keys = await redis.keys('translation:*');
      if (keys.length > 0) {
        await redis.del(keys);
      }
      console.log('Translation cache cleared');
    } catch (error) {
      console.error('Cache clearing error:', error);
    }
  }

  /**
   * Проверка статуса API ключей
   */
  async checkApiKeys() {
    return await this.keyManager.checkAllKeys();
  }

  /**
   * Очистка черного списка ключей
   */
  async clearKeyBlacklist() {
    await this.keyManager.clearBlacklist();
  }
}

module.exports = Translator;