/**
 * TranslationDocument segment builder (pre-translation structure).
 *
 * Turns extracted blocks (paragraphs) into a segment-aligned structure:
 * each block is split into sentences, every sentence gets a stable id and its
 * source word tokens. A flat `segments` array references the same sentence
 * objects so later stages can batch-translate and have results flow back into
 * the block structure (shared object identity).
 *
 * Translation/alignment fields are filled in by a later task.
 */

const { splitSentences, tokenize } = require('./segmenter');

/** Schema version for the produced structure. */
const SCHEMA_VERSION = 1;

/**
 * Build the pre-translation segment structure from extracted blocks.
 *
 * Blocks whose content has no sentences (empty/whitespace-only) are skipped,
 * but the original 0-based index is preserved in the generated block id.
 *
 * @param {Array<{type?:string,content?:string}>} blocks
 * @returns {{blocks: Array<{id:string,type:string,sentences:Array<{id:string,source:string,srcTokens:string[]}>}>, segments: Array<{id:string,source:string,srcTokens:string[]}>}}
 */
function buildSegments(blocks) {
  const outBlocks = [];
  const segments = [];

  const input = Array.isArray(blocks) ? blocks : [];

  input.forEach((block, n) => {
    const sentencesText = splitSentences(block && block.content);
    if (sentencesText.length === 0) return; // skip empty blocks

    const sentences = sentencesText.map((source, m) => ({
      id: `b${n}s${m}`,
      source,
      srcTokens: tokenize(source),
    }));

    outBlocks.push({
      id: `b${n}`,
      type: (block && block.type) || 'paragraph',
      sentences,
    });

    for (const sentence of sentences) {
      segments.push(sentence);
    }
  });

  return { blocks: outBlocks, segments };
}

module.exports = { SCHEMA_VERSION, buildSegments };
