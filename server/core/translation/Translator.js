/**
 * Core Translator - Clean business logic
 * No external dependencies - uses injected adapters
 */

const crypto = require('crypto');

class Translator {
  /**
   * @param {import('./interfaces').AIProvider} aiProvider
   * @param {import('./interfaces').TranslationCache} cache
   * @param {Object} options
   */
  constructor(aiProvider, cache, options = {}) {
    this.ai = aiProvider;
    this.cache = cache;
    this.options = {
      cacheTTL: options.cacheTTL || 7 * 24 * 60 * 60 * 1000, // 7 days
      maxTextLength: options.maxTextLength || 5000,
      batchSize: options.batchSize || 5,
      ...options
    };
    this.supportedLanguages = ['he', 'en', 'ru', 'ar'];
    this.model = options.model || 'default';
    this.promptVersion = options.promptVersion || 'v1';
  }

  /**
   * Generate cache key for translation
   * @private
   */
  cacheKey(text, from, to) {
    const hash = crypto
      .createHash('sha256')
      .update(`${text}|${from}|${to}|${this.model}|${this.promptVersion}`)
      .digest('hex')
      .substring(0, 16);
    return `tr:${this.model}:${from}:${to}:${hash}`;
  }

  /**
   * Translate single text
   * @param {string} text
   * @param {string} from - Source language
   * @param {string} to - Target language
   * @returns {Promise<import('./interfaces').TranslationResult>}
   */
  async translateText(text, from, to) {
    // Validate input
    if (!text || typeof text !== 'string') {
      return { text: text || '', fromCache: false };
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return { text: '', fromCache: false };
    }

    // Skip if same language
    if (from === to) {
      return { text: trimmed, fromCache: false };
    }

    // Check cache
    const key = this.cacheKey(trimmed, from, to);
    const cached = await this.cache.get(key);
    if (cached) {
      return { text: cached, fromCache: true };
    }

    // Translate with AI
    const translated = await this.ai.translate(trimmed, from, to);

    // Cache result
    await this.cache.set(key, translated, this.options.cacheTTL);

    return { text: translated, fromCache: false };
  }

  /**
   * Translate array of texts in batch
   * @param {string[]} texts
   * @param {string} from
   * @param {string} to
   * @returns {Promise<import('./interfaces').TranslationResult[]>}
   */
  async translateBatch(texts, from, to) {
    const results = [];

    for (let i = 0; i < texts.length; i += this.options.batchSize) {
      const batch = texts.slice(i, i + this.options.batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.translateText(text, from, to))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Translate document blocks
   * @param {Array} blocks - Document blocks
   * @param {string} targetLang
   * @returns {Promise<Array>}
   */
  async translateDocument(blocks, targetLang) {
    // Translate blocks with bounded concurrency. Previously this ran strictly
    // sequentially (one LLM round-trip per block), so multi-paragraph documents
    // took minutes. We now process up to `docConcurrency` blocks in parallel
    // while preserving original order.
    const concurrency = this.options.docConcurrency || 5;
    const out = new Array(blocks.length);

    for (let i = 0; i < blocks.length; i += concurrency) {
      const slice = blocks.slice(i, i + concurrency);
      const results = await Promise.all(
        slice.map(block => this.translateBlock(block, targetLang))
      );
      for (let j = 0; j < results.length; j++) {
        out[i + j] = results[j];
      }
    }

    return out;
  }

  /**
   * Translate a single document block (text or table). Cells within a table are
   * still translated sequentially (tables are small); blocks themselves are
   * parallelised by translateDocument.
   * @private
   */
  async translateBlock(block, targetLang) {
    if (block.type === 'table') {
      const translatedRows = [];
      for (const row of block.rows) {
        const translatedRow = [];
        for (const cell of row) {
          if (cell.needsTranslation && cell.content) {
            const result = await this.translateText(cell.content, cell.sourceLang || 'he', targetLang);
            translatedRow.push({ ...cell, content: result.text, needsTranslation: false, fromCache: result.fromCache });
          } else {
            translatedRow.push(cell);
          }
        }
        translatedRows.push(translatedRow);
      }
      return { ...block, rows: translatedRows };
    }

    if (block.needsTranslation && block.content) {
      const result = await this.translateText(block.content, block.sourceLang || 'he', targetLang);
      return { ...block, content: result.text, needsTranslation: false, fromCache: result.fromCache };
    }

    return block;
  }

  /**
   * Detect language of text
   * @param {string} text
   * @returns {Promise<string|null>}
   */
  async detectLanguage(text) {
    if (!text || text.trim().length < 3) {
      return null;
    }

    // Quick heuristic for Hebrew
    const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
    const cyrillicChars = (text.match(/[\u0400-\u04FF]/g) || []).length;

    const total = hebrewChars + arabicChars + latinChars + cyrillicChars;
    if (total === 0) return null;

    if (hebrewChars / total > 0.5) return 'he';
    if (arabicChars / total > 0.5) return 'ar';
    if (cyrillicChars / total > 0.5) return 'ru';
    if (latinChars / total > 0.5) return 'en';

    // Fallback to AI detection for ambiguous cases
    return this.ai.detectLanguage(text);
  }

  /**
   * Check if text needs translation
   * @param {string} text
   * @param {string} targetLang
   * @returns {Promise<boolean>}
   */
  async needsTranslation(text, targetLang) {
    const detected = await this.detectLanguage(text);
    return detected !== null && detected !== targetLang;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear translation cache
   */
  async clearCache() {
    await this.cache.clear();
  }

  /**
   * Health check
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    const aiHealthy = await this.ai.healthCheck();
    const cacheStats = this.cache.getStats();

    return {
      healthy: aiHealthy,
      ai: aiHealthy ? 'connected' : 'disconnected',
      cache: cacheStats
    };
  }
}

module.exports = Translator;
