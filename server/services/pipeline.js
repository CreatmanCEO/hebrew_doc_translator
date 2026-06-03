'use strict';

/**
 * Translation pipeline assembly core.
 *
 * Pure, side-effect-light orchestration that turns a pre-translation segment
 * structure (from `translationDocument.buildSegments`) into a complete
 * `TranslationDocument` by calling a batch-translate function.
 *
 * Two concerns:
 *  - `chunkSegments`: pack ordered segments into translation chunks bounded by
 *    both a segment count and a source-token budget.
 *  - `buildTranslationDocument`: cap, chunk, translate with bounded concurrency,
 *    fold results back into the shared segment/block objects, and aggregate
 *    usage into a finalized document.
 *
 * The translate function is injected (in prod it wraps
 * `LiteLLMProvider.translateBatchAligned`; in tests a fake), keeping this module
 * deterministic and unit-testable.
 */

const { tokenize } = require('./segmenter');
const { validateAlign } = require('./align');
const { newUsage, addCall, finalize } = require('./usage');
const { SCHEMA_VERSION } = require('./translationDocument');

/**
 * Pack ordered segments into chunks, starting a new chunk when adding the next
 * segment would exceed either `maxPerChunk` (count) or `maxTokens` (accumulated
 * srcTokens length). A single segment whose token count alone exceeds the budget
 * still occupies its own chunk.
 *
 * @param {Array<{srcTokens?: string[]}>} segments
 * @param {{maxPerChunk?: number, maxTokens?: number}} [opts]
 * @returns {Array<Array<object>>}
 */
function chunkSegments(segments, { maxPerChunk = 18, maxTokens = 1500 } = {}) {
  const out = [];
  const list = Array.isArray(segments) ? segments : [];

  let current = [];
  let curTokens = 0;

  for (const seg of list) {
    const segTokens = Array.isArray(seg.srcTokens) ? seg.srcTokens.length : 0;

    if (
      current.length > 0 &&
      (current.length + 1 > maxPerChunk || curTokens + segTokens > maxTokens)
    ) {
      out.push(current);
      current = [];
      curTokens = 0;
    }

    current.push(seg);
    curTokens += segTokens;
  }

  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Process chunks through `translateBatch` in waves of `concurrency`, returning
 * the flat array of per-chunk results in chunk order.
 */
async function translateChunks(chunks, translateBatch, concurrency) {
  const width = Math.max(1, concurrency | 0);
  const results = [];

  for (let i = 0; i < chunks.length; i += width) {
    const wave = chunks.slice(i, i + width);
    const settled = await Promise.all(
      wave.map((chunk) =>
        translateBatch(
          chunk.map((s) => ({ id: s.id, source: s.source, srcTokens: s.srcTokens })),
        ),
      ),
    );
    for (const r of settled) results.push(r);
  }

  return results;
}

/**
 * Build a complete TranslationDocument from a segment structure.
 *
 * Mutates the shared segment objects in place (they share identity with the
 * sentences inside `blocks`), so block sentences reflect the translation.
 *
 * @param {{blocks: Array<object>, segments: Array<{id:string,source:string,srcTokens:string[]}>}} structure
 * @param {(chunk: Array<{id:string,source:string,srcTokens:string[]}>) => Promise<{items:Array<{id:string,target?:string,align?:unknown}>, usage?:object}>} translateBatch
 * @param {{sourceLang?:string,targetLang?:string,maxSegments?:number,concurrency?:number,owner?:string,jobId?:string|number|null,ts?:number|null,onCap?:(info:{total:number,cap:number})=>void}} [opts]
 * @returns {Promise<object>} the finalized translation document
 */
async function buildTranslationDocument(structure, translateBatch, opts = {}) {
  const { blocks = [], segments = [] } = structure || {};
  const {
    sourceLang,
    targetLang,
    maxSegments = 1500,
    concurrency = 3,
    owner = 'anon',
    jobId = null,
    ts = null,
    onCap = null,
  } = opts;

  // Segment cap: only the first `maxSegments` are translated; the rest pass
  // through as source.
  let toTranslate = segments;
  if (segments.length > maxSegments) {
    toTranslate = segments.slice(0, maxSegments);
    if (typeof onCap === 'function') {
      onCap({ total: segments.length, cap: maxSegments });
    }
  }

  // Chunk + translate with bounded concurrency.
  const chunks = chunkSegments(toTranslate, opts);
  const chunkResults = await translateChunks(chunks, translateBatch, concurrency);

  // Aggregate usage and build id -> item map.
  const usage = newUsage();
  const byId = new Map();
  for (const result of chunkResults) {
    if (result && result.usage) addCall(usage, result.usage);
    const items = result && Array.isArray(result.items) ? result.items : [];
    for (const item of items) {
      if (item && item.id != null) byId.set(item.id, item);
    }
  }

  // Fold results back into every segment (capped ones get the pass-through path).
  for (const seg of segments) {
    const item = byId.get(seg.id);
    if (item && typeof item.target === 'string') {
      seg.target = item.target;
      seg.tgtTokens = tokenize(item.target);
      seg.align = validateAlign(item.align, seg.srcTokens, seg.tgtTokens);
    } else {
      seg.target = seg.source;
      seg.tgtTokens = [...seg.srcTokens];
      seg.align = [];
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    sourceLang,
    targetLang,
    blocks,
    usage: finalize(usage, { owner, jobId, ts }),
  };
}

module.exports = { chunkSegments, buildTranslationDocument };
