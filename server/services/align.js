'use strict';

/**
 * Validate and sanitize an LLM-emitted alignment array.
 *
 * The LLM emits `align` as an array of `{ src: [tokenIdx...], tgt: [tokenIdx...] }`
 * groups linking source-sentence tokens to translation tokens. This output is
 * untrusted: indices may be out of range, non-integer, or the whole structure
 * may be malformed. This function keeps only valid groups and never throws.
 * Callers can fall back to sentence-level highlighting when the result is empty.
 *
 * @param {unknown} align - candidate alignment array from the LLM
 * @param {unknown} srcTokens - source-sentence tokens
 * @param {unknown} tgtTokens - translation tokens
 * @returns {Array<{src: number[], tgt: number[]}>} sanitized groups (possibly empty)
 */
function validateAlign(align, srcTokens, tgtTokens) {
  if (!Array.isArray(align)) return [];

  const sLen = Array.isArray(srcTokens) ? srcTokens.length : 0;
  const tLen = Array.isArray(tgtTokens) ? tgtTokens.length : 0;

  const validIdxArray = (a, len) =>
    Array.isArray(a) &&
    a.length > 0 &&
    a.every((i) => Number.isInteger(i) && i >= 0 && i < len);

  const out = [];
  for (const g of align) {
    if (g && validIdxArray(g.src, sLen) && validIdxArray(g.tgt, tLen)) {
      out.push({ src: g.src, tgt: g.tgt });
    }
  }
  return out;
}

module.exports = { validateAlign };
