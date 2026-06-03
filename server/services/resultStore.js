'use strict';

/**
 * In-memory result store for translated documents.
 *
 * Single-process app: the Bull worker and the API run in the same Node process,
 * so this module-level Map is shared between them. Each entry holds the produced
 * TranslationDocument and an absolute expiry timestamp; expired entries are
 * lazily evicted on read and proactively cleaned up via a scheduled timer.
 *
 * `now` is injectable on the read/write entry points so tests can exercise TTL
 * behaviour deterministically without real timers.
 */

const store = new Map();

const DEFAULT_TTL_MS = 15 * 60 * 1000;

/**
 * Store a translation document under `token` with a TTL.
 *
 * @param {string} token
 * @param {object} doc finalized TranslationDocument
 * @param {number} [ttlMs] time-to-live in ms
 * @param {number} [now] current epoch ms (injectable for tests)
 */
function saveResult(token, doc, ttlMs = DEFAULT_TTL_MS, now = Date.now()) {
  store.set(token, { doc, expires: now + ttlMs });

  // Proactive cleanup so the Map doesn't grow unbounded. Guarded so it doesn't
  // keep the event loop alive and never fires when ttl isn't a real duration.
  if (ttlMs > 0 && typeof setTimeout === 'function') {
    const timer = setTimeout(() => {
      const entry = store.get(token);
      if (entry && entry.expires <= Date.now()) store.delete(token);
    }, ttlMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
}

/**
 * Fetch a stored document by token, or `null` if missing/expired.
 * Expired entries are deleted on access.
 *
 * @param {string} token
 * @param {number} [now] current epoch ms (injectable for tests)
 * @returns {object|null}
 */
function getResult(token, now = Date.now()) {
  const entry = store.get(token);
  if (!entry) return null;
  if (entry.expires <= now) {
    store.delete(token);
    return null;
  }
  return entry.doc;
}

/**
 * List recently stored docs that carry a `usage` field, most-recent first.
 * Used by the admin usage endpoint.
 *
 * @param {number} [limit]
 * @returns {Array<{token: string, usage: object}>}
 */
function recentUsage(limit = 50) {
  const out = [];
  // Map preserves insertion order; iterate newest-first.
  const entries = Array.from(store.entries()).reverse();
  for (const [token, entry] of entries) {
    if (entry && entry.doc && entry.doc.usage) {
      out.push({ token, usage: entry.doc.usage });
      if (out.length >= limit) break;
    }
  }
  return out;
}

module.exports = { saveResult, getResult, recentUsage };
