/**
 * Core interfaces for translation system
 * These are contracts - implementations are in adapters/
 */

/**
 * @typedef {Object} TranslationResult
 * @property {string} text - Translated text
 * @property {boolean} fromCache - Whether result was from cache
 * @property {number} [tokensUsed] - API tokens used (if applicable)
 */

/**
 * @typedef {'he'|'en'|'ru'|'ar'} Language
 */

/**
 * AI Provider Interface
 * @interface AIProvider
 */
class AIProvider {
  /**
   * @param {string} text
   * @param {Language} from
   * @param {Language} to
   * @returns {Promise<string>}
   */
  async translate(text, from, to) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} text
   * @returns {Promise<Language|null>}
   */
  async detectLanguage(text) {
    throw new Error('Not implemented');
  }

  /**
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    throw new Error('Not implemented');
  }
}

/**
 * Cache Interface
 * @interface TranslationCache
 */
class TranslationCache {
  /**
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} key
   * @param {string} value
   * @param {number} [ttl] - Time to live in ms
   * @returns {Promise<void>}
   */
  async set(key, value, ttl) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    throw new Error('Not implemented');
  }

  /**
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error('Not implemented');
  }

  /**
   * @returns {Object} Cache statistics
   */
  getStats() {
    throw new Error('Not implemented');
  }
}

module.exports = { AIProvider, TranslationCache };
