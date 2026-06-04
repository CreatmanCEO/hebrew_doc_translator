'use strict';

const fs = require('fs');
const path = require('path');
const { PDFExtract } = require('pdf.js-extract');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

/**
 * Union the bounding boxes of a list of items/boxes.
 * Accepts items shaped as { x, y, width, height } or { x, y, w, h }.
 * Returns { x, y, w, h }.
 */
function unionBbox(boxes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX2 = -Infinity;
  let maxY2 = -Infinity;
  for (const b of boxes) {
    const w = b.width != null ? b.width : b.w;
    const h = b.height != null ? b.height : b.h;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + w > maxX2) maxX2 = b.x + w;
    if (b.y + h > maxY2) maxY2 = b.y + h;
  }
  return { x: minX, y: minY, w: maxX2 - minX, h: maxY2 - minY };
}

/**
 * Pure function: group positioned text items into lines then blocks.
 *
 * @param {Array<{x:number,y:number,width:number,height:number,str:string}>} items - items for ONE page (top-left origin).
 * @param {{yTol?:number, blockGapFactor?:number}} [opts]
 * @returns {Array<{bbox:{x,y,w,h}, content:string, lines:Array<{bbox:{x,y,w,h}, text:string}>}>}
 */
function groupBlocks(items, { yTol = 3, blockGapFactor = 1.6 } = {}) {
  // Drop empty/missing strings.
  const clean = (items || []).filter((i) => i && typeof i.str === 'string' && i.str.trim() !== '');

  // Sort by y asc, then x asc.
  const sorted = clean.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));

  // Cluster into lines.
  const lines = [];
  let current = null;
  let currentLineY = null;
  for (const item of sorted) {
    if (current === null || Math.abs(item.y - currentLineY) > yTol) {
      current = [];
      currentLineY = item.y; // line anchored on its first item's y
      lines.push(current);
    }
    current.push(item);
  }

  const builtLines = lines.map((lineItems) => {
    const byX = lineItems.slice().sort((a, b) => a.x - b.x);
    const bbox = unionBbox(byX);
    const height = byX.reduce((m, i) => Math.max(m, i.height), 0);
    return {
      bbox,
      text: byX.map((i) => i.str).join(' '),
      height,
    };
  });

  // Group consecutive lines into blocks.
  const blocks = [];
  let currentBlock = null;
  let prevLine = null;
  for (const line of builtLines) {
    if (
      currentBlock === null ||
      line.bbox.y - (prevLine.bbox.y + prevLine.height) > prevLine.height * blockGapFactor
    ) {
      currentBlock = [];
      blocks.push(currentBlock);
    }
    currentBlock.push(line);
    prevLine = line;
  }

  return blocks.map((blockLines) => ({
    bbox: unionBbox(blockLines.map((l) => l.bbox)),
    content: blockLines.map((l) => l.text).join(' '),
    lines: blockLines.map((l) => ({ bbox: l.bbox, text: l.text })),
  }));
}

/**
 * Convert a top-left-origin bbox (pdf.js-extract) to a bottom-left-origin
 * rectangle (pdf-lib). y grows downward in source, upward in pdf-lib.
 *
 * @param {{x:number,y:number,w:number,h:number}} bbox
 * @param {number} pageHeight
 * @returns {{x:number,y:number,w:number,h:number}}
 */
function toPdfRect(bbox, pageHeight) {
  return { x: bbox.x, y: pageHeight - bbox.y - bbox.h, w: bbox.w, h: bbox.h };
}

/**
 * Greedily word-wrap `text` into lines that each fit `boxW` at `size`.
 * A single word wider than boxW still goes on its own line (overflow allowed).
 */
function wrapLines(text, boxW, size, measure) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, size) > boxW) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Pure word-wrap + auto-fit: pick the largest font size in [min, max] (step 1)
 * at which the wrapped text fits inside boxW x boxH. If none fit, return the
 * wrap computed at `min` (overflow allowed, never throws, never clips).
 *
 * @param {string} text
 * @param {number} boxW
 * @param {number} boxH
 * @param {(str:string, size:number)=>number} measure - width in pt
 * @param {{max?:number, min?:number, lineGap?:number}} [opts]
 * @returns {{size:number, lines:string[]}}
 */
function wrapAndFit(text, boxW, boxH, measure, { max = 14, min = 6, lineGap = 1.15 } = {}) {
  if (!text || text.trim() === '') return { size: max, lines: [] };

  let fallback = null;
  for (let size = max; size >= min; size -= 1) {
    const lines = wrapLines(text, boxW, size, measure);
    if (size === min) fallback = { size, lines };
    if (lines.length * size * lineGap <= boxH) return { size, lines };
  }
  // No size fit: return the wrap at min (overflow allowed).
  return fallback || { size: min, lines: wrapLines(text, boxW, min, measure) };
}

/**
 * Extract blocks (with positions) from a PDF buffer using its text layer.
 * @param {Buffer} buffer
 * @returns {Promise<{blocks:Array, noTextLayer:boolean}>}
 */
function extractBlocks(buffer) {
  return new Promise((resolve, reject) => {
    new PDFExtract().extractBuffer(buffer, {}, (err, data) => {
      if (err) return reject(err);
      const pages = (data && data.pages) || [];
      let total = 0;
      const blocks = [];
      pages.forEach((pg, pi) => {
        const items = (pg.content || []).map((c) => ({
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
          str: c.str,
        }));
        total += items.filter((i) => i.str && i.str.trim()).length;
        const pw = (pg.pageInfo && pg.pageInfo.width) || pg.width;
        const ph = (pg.pageInfo && pg.pageInfo.height) || pg.height;
        groupBlocks(items).forEach((b) =>
          blocks.push({ ...b, page: pi, pageWidth: pw, pageHeight: ph })
        );
      });
      resolve({ blocks, noTextLayer: total === 0 });
    });
  });
}

/**
 * Render translations onto a copy of the original PDF. Loading the original
 * buffer preserves its images/vectors; for each block we white-out the source
 * text region then draw the wrapped + auto-fitted translation in a Unicode font
 * (DejaVuSans covers Latin + Cyrillic).
 *
 * @param {Buffer} buffer - original PDF bytes
 * @param {Array<{page:number, pageHeight?:number, bbox:{x,y,w,h}, target:string}>} blocks
 * @returns {Promise<Buffer>} overlaid PDF bytes
 */
async function renderOverlay(buffer, blocks) {
  const pdf = await PDFDocument.load(buffer);
  pdf.registerFontkit(fontkit);

  const fontBytes = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf')
  );
  const font = await pdf.embedFont(fontBytes, { subset: true });

  const pages = pdf.getPages();

  for (const block of blocks || []) {
    if (typeof block.target !== 'string' || !block.target.trim()) continue;
    const page = pages[block.page];
    if (!page) continue;

    const ph = block.pageHeight || page.getHeight();
    const r = toPdfRect(block.bbox, ph);

    // White-out the original text region.
    page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgb(1, 1, 1) });

    const { size, lines } = wrapAndFit(
      block.target,
      r.w,
      r.h,
      (s, sz) => font.widthOfTextAtSize(s, sz),
      { max: Math.max(6, Math.min(14, r.h)), min: 6, lineGap: 1.15 }
    );

    let ty = r.y + r.h - size;
    for (const line of lines) {
      page.drawText(line, { x: r.x, y: ty, size, font, color: rgb(0, 0, 0) });
      ty -= size * 1.15;
    }
  }

  return Buffer.from(await pdf.save());
}

module.exports = { groupBlocks, extractBlocks, unionBbox, toPdfRect, wrapAndFit, renderOverlay };
