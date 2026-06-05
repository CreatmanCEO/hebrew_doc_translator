'use strict';

/**
 * PDF -> structure engine (digital/text-layer PDFs).
 *
 * Pipeline: extract positioned text fragments via pdf.js-extract, then ask an
 * injected LLM (`chatFn`) to reconstruct a clean, ordered, translated document
 * per page. The LLM is responsible for reading-order recovery (Hebrew is RTL),
 * element classification, and translation; this module only marshals data,
 * validates/normalizes the LLM's JSON, aggregates usage, and degrades
 * gracefully when the model returns garbage.
 *
 * The LLM call is injected (no provider import here) so tests run offline.
 */

const { PDFExtract } = require('pdf.js-extract');
const { newUsage, addCall, finalize } = require('./usage');

/**
 * Validate + coerce a raw element list (typically straight from LLM JSON) into
 * well-formed StructuredDoc elements. PURE: never throws, never mutates input.
 *
 * @param {*} arr
 * @returns {Array<object>}
 */
function normalizeElements(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const el of arr) {
    if (!el || typeof el !== 'object') continue;

    if (el.type === 'heading') {
      if (typeof el.target !== 'string') continue;
      out.push({
        type: 'heading',
        level: Number.isInteger(el.level) ? el.level : 1,
        source: el.source || '',
        target: el.target,
      });
    } else if (el.type === 'paragraph') {
      if (typeof el.target !== 'string') continue;
      out.push({ type: 'paragraph', source: el.source || '', target: el.target });
    } else if (el.type === 'list') {
      if (!Array.isArray(el.items)) continue;
      const items = el.items
        .filter((it) => it && typeof it.target === 'string')
        .map((it) => ({ source: it.source || '', target: it.target }));
      if (items.length === 0) continue;
      out.push({ type: 'list', ordered: !!el.ordered, items });
    } else if (el.type === 'table') {
      if (!Array.isArray(el.rows)) continue;
      const rows = el.rows
        .filter((r) => Array.isArray(r))
        .map((r) => r.map((c) => ({ source: (c && c.source) || '', target: (c && c.target) || '' })));
      if (rows.length === 0) continue;
      out.push({ type: 'table', rows });
    }
    // anything else / unknown type -> dropped
  }
  return out;
}

/**
 * Extract positioned text fragments from a digital PDF buffer.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{pages: Array<{items: Array<{x:number,y:number,str:string}>, width:number, height:number}>, noTextLayer: boolean}>}
 */
function extractItems(buffer) {
  return new Promise((resolve, reject) => {
    new PDFExtract().extractBuffer(buffer, {}, (err, data) => {
      if (err) return reject(err);
      const rawPages = (data && data.pages) || [];
      let nonEmpty = 0;
      const pages = rawPages.map((p) => {
        const content = p.content || [];
        const items = content.map((c) => ({ x: c.x, y: c.y, str: c.str }));
        for (const it of items) if (it.str && String(it.str).trim()) nonEmpty += 1;
        const info = p.pageInfo || {};
        return { items, width: info.width, height: info.height };
      });
      resolve({ pages, noTextLayer: nonEmpty === 0 });
    });
  });
}

/**
 * Build the system+user prompt for a single page worth of positioned fragments.
 *
 * @param {Array<{x:number,y:number,str:string}>} items
 * @param {string} from
 * @param {string} to
 * @returns {{system: string, user: string}}
 */
function buildPrompt(items, from, to) {
  const system =
    `You are a document reconstruction and translation engine. You receive an ` +
    `array of positioned text fragments from one page of a PDF, each as ` +
    `{x, y, s} where x/y are coordinates (top-left origin) and s is the text. ` +
    `The source language is ${from}, which is RTL Hebrew: within a line, read ` +
    `fragments right-to-left (higher x first); lines run top-to-bottom (lower y ` +
    `first). Reconstruct the document in correct reading order. Classify the ` +
    `content into elements of type "heading" (with a numeric "level"), ` +
    `"paragraph", "list" (with boolean "ordered" for numbered vs bulleted), and ` +
    `"table". Translate every piece of text from ${from} to ${to}. ` +
    `Return STRICT JSON only, no prose, no markdown fences, of the shape ` +
    `{"elements":[...]}. Each text element carries both "source" (original ${from}) ` +
    `and "target" (translated ${to}): ` +
    `{"type":"heading","level":1,"source":"...","target":"..."}, ` +
    `{"type":"paragraph","source":"...","target":"..."}, ` +
    `{"type":"list","ordered":false,"items":[{"source":"...","target":"..."}]}, ` +
    `{"type":"table","rows":[[{"source":"...","target":"..."}]]}.`;
  const user = JSON.stringify(items.map((i) => ({ x: Math.round(i.x), y: Math.round(i.y), s: i.str })));
  return { system, user };
}

/**
 * Parse possibly-fenced JSON leniently. Returns {} on any failure.
 *
 * @param {string} s
 * @returns {object}
 */
function parseJsonLoose(s) {
  let text = String(s == null ? '' : s).trim();
  // strip leading ```json / ``` fence and trailing ```
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

/**
 * Run the LLM restructuring/translation across all pages, aggregating usage.
 * Degrades per page (never throws) when the model output is unusable.
 *
 * @param {Array<{items: Array<{x:number,y:number,str:string}>}>} pages
 * @param {string} from
 * @param {string} to
 * @param {(system:string,user:string)=>Promise<{content:string,usage?:object}>} chatFn
 * @param {{onChunkError?: (e:Error)=>void}} [opts]
 * @returns {Promise<{elements: Array<object>, usage: object}>}
 */
async function structurePages(pages, from, to, chatFn, { onChunkError } = {}) {
  const usage = newUsage();
  const elements = [];

  for (const page of pages) {
    const { system, user } = buildPrompt(page.items, from, to);
    try {
      const { content, usage: u } = await chatFn(system, user);
      if (u) addCall(usage, u);
      const parsed = parseJsonLoose(content);
      if (!parsed || !Array.isArray(parsed.elements)) {
        throw new Error('LLM response missing elements array');
      }
      elements.push(...normalizeElements(parsed.elements));
    } catch (e) {
      if (onChunkError) onChunkError(e);
      // degrade: keep the raw page text as an untranslated paragraph so no
      // content is silently lost.
      const text = page.items.map((i) => i.str).join(' ').trim();
      if (text) elements.push({ type: 'paragraph', source: text, target: text });
    }
  }

  return { elements, usage };
}

/**
 * Full entry point: extract a PDF buffer and reconstruct a translated
 * StructuredDoc (schemaVersion 2). Throws only on too-many-pages so the caller
 * can fall back to another strategy.
 *
 * @param {Buffer} buffer
 * @param {string} from
 * @param {string} to
 * @param {(system:string,user:string)=>Promise<{content:string,usage?:object}>} chatFn
 * @param {{maxPages?:number, owner?:string, jobId?:(string|number|null), ts?:(number|null)}} [opts]
 * @returns {Promise<{structuredDoc: object, noTextLayer: boolean}>}
 */
async function structureAndTranslate(
  buffer,
  from,
  to,
  chatFn,
  { maxPages = Number(process.env.MAX_PAGES) || 50, owner = 'anon', jobId = null, ts = null } = {},
) {
  const { pages, noTextLayer } = await extractItems(buffer);
  if (pages.length > maxPages) throw new Error('too many pages');

  const { elements, usage } = await structurePages(pages, from, to, chatFn);

  return {
    structuredDoc: {
      schemaVersion: 2,
      sourceLang: from,
      targetLang: to,
      elements,
      usage: finalize(usage, { owner, jobId, ts }),
    },
    noTextLayer,
  };
}

module.exports = {
  normalizeElements,
  extractItems,
  buildPrompt,
  parseJsonLoose,
  structurePages,
  structureAndTranslate,
};
