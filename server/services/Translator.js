const translate = require('@vitalets/google-translate-api').translate;
const { transliterate } = require('hebrew-transliteration');

class Translator {
  constructor() {
    this.supportedLanguages = ['he', 'en', 'ru'];
    this.rateLimiter = {
      tokens: 100,
      lastRefill: Date.now(),
      refillRate: 100, // tokens per minute
      refillInterval: 60000 // 1 minute
    };
  }

  async translateText(text, from, to) {
    if (!text || typeof text !== 'string') {
      throw new Error('Translation failed: Invalid input text');
    }

    if (!this.supportedLanguages.includes(from) || !this.supportedLanguages.includes(to)) {
      throw new Error('Unsupported language combination');
    }

    try {
      await this._checkRateLimit();

      // Обработка смешанного контента
      if (from === 'he') {
        // Разделяем текст на части: иврит и не-иврит
        const parts = text.split(/([^\u0590-\u05FF\s]+)/g);
        const translatedParts = await Promise.all(
          parts.map(async (part) => {
            if (!part.trim()) return part;
            // Если часть содержит иврит
            if (/[\u0590-\u05FF]/.test(part)) {
              try {
                // Транслитерация только для иврита
                const transliterated = transliterate(part);
                const result = await this._translate(transliterated, from, to);
                return result;
              } catch (error) {
                console.warn('Hebrew part translation failed:', error);
                return part;
              }
            }
            // Не-ивритские части оставляем как есть
            return part;
          })
        );
        return translatedParts.join('');
      } else {
        return await this._translate(text, from, to);
      }
    } catch (error) {
      if (error.message === 'Rate limit exceeded') {
        throw new Error('Translation rate limit exceeded. Please try again later.');
      }
      if (error.message === 'API Error') {
        throw new Error('Translation failed: API error');
      }
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  async _translate(text, from, to) {
    const result = await translate(text, {
      from,
      to,
      tld: "com",
      client: "dict-chrome-ex"
    });
    return result.text;
  }

  async translateDocument(blocks, targetLang) {
    const batchSize = 10;
    const translatedBlocks = [];
    let currentBatch = [];

    for (const block of blocks) {
      if (block.type === 'text') {
        currentBatch.push(block);
        
        if (currentBatch.length >= batchSize) {
          const translatedBatch = await this._translateBatch(currentBatch, targetLang);
          translatedBlocks.push(...translatedBatch);
          currentBatch = [];
          
          // Уменьшаем задержку для тестов
          if (process.env.NODE_ENV === 'test') {
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } else {
        if (currentBatch.length > 0) {
          const translatedBatch = await this._translateBatch(currentBatch, targetLang);
          translatedBlocks.push(...translatedBatch);
          currentBatch = [];
        }
        translatedBlocks.push(block);
      }
    }

    if (currentBatch.length > 0) {
      const translatedBatch = await this._translateBatch(currentBatch, targetLang);
      translatedBlocks.push(...translatedBatch);
    }

    return translatedBlocks;
  }

  async _translateBatch(blocks, targetLang) {
    const promises = blocks.map(async (block) => {
      try {
        const translatedText = await this.translateText(block.content, block.language, targetLang);
        return {
          ...block,
          content: translatedText,
          originalContent: block.content
        };
      } catch (error) {
        console.error(`Failed to translate block: ${error.message}`);
        return block;
      }
    });

    return Promise.all(promises);
  }

  async _checkRateLimit() {
    const now = Date.now();
    const timePassed = now - this.rateLimiter.lastRefill;
    const tokensToAdd = Math.floor(timePassed / this.rateLimiter.refillInterval) * this.rateLimiter.refillRate;

    if (tokensToAdd > 0) {
      this.rateLimiter.tokens = Math.min(100, this.rateLimiter.tokens + tokensToAdd);
      this.rateLimiter.lastRefill = now;
    }

    if (this.rateLimiter.tokens < 1) {
      throw new Error('Rate limit exceeded');
    }

    this.rateLimiter.tokens--;
  }

  validateLanguage(lang) {
    return this.supportedLanguages.includes(lang);
  }
}

module.exports = Translator;