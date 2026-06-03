/**
 * Sentence and token segmentation helpers.
 *
 * Pure functions with no external dependencies. Uses the built-in
 * Intl.Segmenter (Node >= 18) for locale-aware sentence boundaries, with a
 * regex fallback. All input is NFC-normalized to keep Hebrew/Latin combining
 * marks stable across the pipeline.
 */

/**
 * Unicode NFC-normalize a value (coerced to string).
 * @param {*} s
 * @returns {string}
 */
function nfc(s) {
  return String(s || '').normalize('NFC');
}

/**
 * Split text into whitespace-delimited tokens, dropping empties.
 * @param {string} s
 * @returns {string[]}
 */
function tokenize(s) {
  return nfc(s).trim().split(/\s+/).filter(Boolean);
}

/**
 * Split text into sentences.
 * Prefers Intl.Segmenter (granularity: 'sentence'); falls back to a
 * terminator-based regex when Segmenter is unavailable.
 * @param {string} s
 * @param {string} [locale='und']
 * @returns {string[]}
 */
function splitSentences(s, locale = 'und') {
  const text = nfc(s).trim();
  if (!text) return [];

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter(locale, { granularity: 'sentence' });
    const out = [];
    for (const part of seg.segment(text)) {
      const trimmed = part.segment.trim();
      if (trimmed) out.push(trimmed);
    }
    return out;
  }

  return text
    .split(/(?<=[.!?。…])\s+/)
    .map(x => x.trim())
    .filter(Boolean);
}

module.exports = { nfc, tokenize, splitSentences };
