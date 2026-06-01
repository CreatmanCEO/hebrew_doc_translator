/**
 * Flat-text document helpers.
 *
 * Bridges the flat text produced by documentProcessor.processDocument and the
 * block-based interface expected by the core Translator.
 */

/**
 * Split flat text into paragraph blocks on blank-line boundaries.
 * Trims each paragraph, drops empty/whitespace-only ones, and marks the rest
 * as translatable Hebrew text blocks.
 * @param {string} str
 * @returns {Array<{type:'text',content:string,sourceLang:'he',needsTranslation:true}>}
 */
function toBlocks(str) {
  if (!str || typeof str !== 'string') {
    return [];
  }

  return str
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(content => ({
      type: 'text',
      content,
      sourceLang: 'he',
      needsTranslation: true
    }));
}

/**
 * Join translated block contents back into flat text separated by blank lines.
 * @param {Array<{content:string}>} blocks
 * @returns {string}
 */
function renderText(blocks) {
  return blocks.map(b => b.content).join('\n\n');
}

module.exports = { toBlocks, renderText };
