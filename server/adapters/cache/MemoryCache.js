/**
 * In-Memory Cache with LRU eviction
 * No external dependencies - works everywhere
 */

const { TranslationCache } = require('../../core/translation/interfaces');

class MemoryCache extends TranslationCache {
  constructor(options = {}) {
    super();
    this.maxSize = options.maxSize || 10000;
    this.defaultTTL = options.defaultTTL || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;

    // Periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, options.cleanupInterval || 60000); // Every minute
  }

  /**
   * Get value from cache
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Move to end for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key
   * @param {string} value
   * @param {number} [ttl]
   */
  async set(key, value, ttl = this.defaultTTL) {
    // LRU eviction if cache is full
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + ttl,
      created: Date.now()
    });
  }

  /**
   * Check if key exists
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete key
   * @param {string} key
   */
  async delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  async clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%',
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage
   * @private
   */
  estimateMemoryUsage() {
    let bytes = 0;
    for (const [key, entry] of this.cache) {
      bytes += key.length * 2; // UTF-16
      bytes += entry.value.length * 2;
      bytes += 24; // Object overhead
    }
    if (bytes > 1024 * 1024) {
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }
    return (bytes / 1024).toFixed(2) + ' KB';
  }

  /**
   * Cleanup expired entries
   * @private
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (entry.expires < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  /**
   * Export cache to JSON (for persistence)
   * @returns {Object}
   */
  export() {
    const data = {};
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.expires > now) {
        data[key] = entry;
      }
    }

    return data;
  }

  /**
   * Import cache from JSON
   * @param {Object} data
   */
  import(data) {
    const now = Date.now();

    for (const [key, entry] of Object.entries(data)) {
      if (entry.expires > now) {
        this.cache.set(key, entry);
      }
    }
  }

  /**
   * Stop cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = MemoryCache;
