/**
 * Translation module - factory and exports
 */

const Translator = require('./Translator');
const { AIProvider, TranslationCache } = require('./interfaces');

// Adapters
const LiteLLMProvider = require('../../adapters/ai/LiteLLMProvider');
const OpenRouterProvider = require('../../adapters/ai/OpenRouterProvider');
const MemoryCache = require('../../adapters/cache/MemoryCache');

/**
 * Create a translator with default configuration
 * @param {Object} options
 * @returns {Translator}
 */
function createTranslator(options = {}) {
  // AI Provider
  const aiProvider = options.aiProvider || new LiteLLMProvider({
    baseURL: options.baseURL,
    apiKey: options.apiKey,
    model: options.model || 'translate'
  });

  // Cache
  const cache = options.cache || new MemoryCache({
    maxSize: options.cacheMaxSize || 10000
  });

  return new Translator(aiProvider, cache, {
    cacheTTL: options.cacheTTL,
    batchSize: options.batchSize,
    model: options.model || 'translate'
  });
}

/**
 * Create translator for testing (with mock AI)
 * @returns {Translator}
 */
function createMockTranslator() {
  const mockAI = {
    async translate(text, from, to) {
      return `[MOCK ${from}->${to}] ${text}`;
    },
    async detectLanguage(text) {
      const he = (text.match(/[\u0590-\u05FF]/g) || []).length;
      if (he > 0) return 'he';
      return 'en';
    },
    async healthCheck() {
      return true;
    }
  };

  return new Translator(mockAI, new MemoryCache());
}

module.exports = {
  Translator,
  AIProvider,
  TranslationCache,
  LiteLLMProvider,
  OpenRouterProvider,
  MemoryCache,
  createTranslator,
  createMockTranslator
};
