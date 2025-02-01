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

      // Предобработка текста на иврите
      let processedText = text;
      if (from === 'he') {
        try {
          processedText = transliterate(text);
        } catch (error) {
          console.warn('Hebrew transliteration failed:', error);
          // Продолжаем с оригинальным текстом если транслитерация не удалась
        }
      }

      const result = await translate(processedText, { 
        from, 
        to,
        tld: "com",
        client: "dict-chrome-ex"
      });
      
      return result.text;
    } catch (error) {
      if (error.message === 'Rate limit exceeded') {
        throw new Error('Translation rate limit exceeded. Please try again later.');
      }
      throw new Error(`Translation failed: ${error.message}`);
    }
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
          
          // Добавляем задержку между батчами
          await new Promise(resolve => setTimeout(resolve, 1000));
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
        return block; // Возвращаем оригинальный блок в случае ошибки
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