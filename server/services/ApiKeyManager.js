const { Configuration, OpenAIApi } = require('openai');
const Redis = require('ioredis');
require('dotenv').config();
const redis = require('../config/redis');

class ApiKeyManager {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD
    });
    
    this.loadKeysFromEnv();
    this.openaiKeyPrefix = 'openai:key:';
    this.keyRotationInterval = 1000 * 60 * 60; // 1 час
  }

  loadKeysFromEnv() {
    this.config = {
      openai: {
        keys: process.env.OPENAI_API_KEYS?.split(',') || [],
        organizations: process.env.OPENAI_ORG_IDS?.split(',') || []
      },
      google: {
        gemini: process.env.GOOGLE_GEMINI_KEY,
        maps: process.env.GOOGLE_MAPS_KEYS?.split(',') || []
      },
      huggingface: {
        token: process.env.HUGGINGFACE_TOKEN
      },
      other_apis: {
        judge0: process.env.JUDGE0_API_KEY,
        hume: process.env.HUME_API_KEY,
        rapid_api: process.env.RAPID_API_KEY
      }
    };
  }

  async validateOpenAIKey(key) {
    try {
      const configuration = new Configuration({ apiKey: key });
      const openai = new OpenAIApi(configuration);
      await openai.listModels();
      return true;
    } catch (error) {
      if (error.response?.status === 401) {
        await this.blacklistKey('openai', key, 'Authentication failed');
      } else if (error.response?.status === 429) {
        await this.blacklistKey('openai', key, 'Rate limit exceeded');
      }
      return false;
    }
  }

  async blacklistKey(service, key, reason) {
    const blacklistKey = `blacklist:${service}:${key}`;
    await this.redis.set(blacklistKey, reason, 'EX', 3600); // Блокировка на 1 час
  }

  async isKeyBlacklisted(service, key) {
    const blacklistKey = `blacklist:${service}:${key}`;
    return await this.redis.exists(blacklistKey);
  }

  async getValidOpenAIKey() {
    for (const key of this.config.openai.keys) {
      if (!(await this.isKeyBlacklisted('openai', key))) {
        if (await this.validateOpenAIKey(key)) {
          return key;
        }
      }
    }
    throw new Error('No valid OpenAI API keys available');
  }

  async clearBlacklist() {
    const keys = await this.redis.keys('blacklist:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  getServiceKey(service) {
    switch (service) {
      case 'gemini':
        return this.config.google.gemini;
      case 'huggingface':
        return this.config.huggingface.token;
      case 'judge0':
        return this.config.other_apis.judge0;
      case 'hume':
        return this.config.other_apis.hume;
      case 'rapid_api':
        return this.config.other_apis.rapid_api;
      default:
        throw new Error(`Unknown service: ${service}`);
    }
  }

  async getOpenAIKey() {
    // Получаем ключ из переменных окружения
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key not found in environment variables');
    }
    return key;
  }

  async markKeyAsUsed(key) {
    const usageKey = `${this.openaiKeyPrefix}${key}:usage`;
    const usage = await redis.incr(usageKey);
    
    // Устанавливаем TTL для счетчика использования
    if (usage === 1) {
      await redis.expire(usageKey, 60 * 60); // 1 час
    }
    
    return usage;
  }

  async isKeyValid(key) {
    const usageKey = `${this.openaiKeyPrefix}${key}:usage`;
    const usage = await redis.get(usageKey);
    
    // Проверяем, не превышен ли лимит использования
    return !usage || parseInt(usage) < 1000; // Примерный лимит
  }
}

module.exports = ApiKeyManager; 