const translate = require('@vitalets/google-translate-api');
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
    if (!this.supportedLanguages.includes(from) || !this.supportedLanguages.includes(to)) {
      throw new Error('Unsupported language combination');
    }

    // Обработка иврита с помощью hebrew-transliteration
    let processedText = text;
    if (from === 'he') {
      // Предобработка иврита для лучшего качества перевода
      processedText = transliterate(text, {
        qametsQatan: true,
        strict: true
      });
    }

    try {
      await this._checkRateLimit();
      const result = await translate(processedText, { from, to });
      
      // Пост-обработка для перевода на иврит
      if (to === 'he') {
        // TODO: Добавить специфичную обработку для перевода на иврит
        // Например, корректировка огласовок, направления текста и т.д.
      }

      return result.text;
    } catch (error) {
      if (error.name === 'TooManyRequestsError') {
        throw new Error('Translation rate limit exceeded. Please try again later.');
      }
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  async translateDocument(blocks, targetLang) {
    const translatedBlocks = [];
    let currentBatch = [];
    const batchSize = 10; // Оптимальный размер пакета

    for (const block of blocks) {
      if (block.type === 'text') {
        currentBatch.push(block);
        
        if (currentBatch.length >= batchSize) {
          const translatedBatch = await this._translateBatch(currentBatch, targetLang);
          translatedBlocks.push(...translatedBatch);
          currentBatch = [];
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

    // Обработка оставшихся блоков
    if (currentBatch.length > 0) {
      const translatedBatch = await this._translateBatch(currentBatch, targetLang);
      translatedBlocks.push(...translatedBatch);
    }

    return translatedBlocks;
  }

  async _translateBatch(blocks, targetLang) {
    const promises = blocks.map(async (block) => {
      const translatedText = await this.translateText(block.content, block.language, targetLang);
      return {
        ...block,
        content: translatedText,
        originalContent: block.content
      };
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
      throw new Error('TooManyRequestsError');
    }

    this.rateLimiter.tokens--;
  }

  validateLanguage(lang) {
    return this.supportedLanguages.includes(lang);
  }
}

module.exports = Translator;