# PDF positional overlay (block-reflow) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** For digital PDF uploads, output a translated PDF that keeps images/vectors/layout by copying original pages and replacing each text block in place with its reflowed, auto-fit translation. Scanned/no-text PDFs fall back to the flat path.

**Architecture:** `pdf.js-extract` → group items into lines→blocks (pure, testable) → existing segment translator (one pass) → `pdf-lib`+`@pdf-lib/fontkit` copy original pages, white-out each block region, draw wrapped auto-fit translation (embedded DejaVuSans). Worker tries overlay; any error / no-text-layer → flat fallback.

**Tech Stack:** pdf.js-extract (present), pdf-lib, @pdf-lib/fontkit, DejaVuSans.ttf (present at `server/assets/fonts/`), existing pipeline, vitest.

**Design:** `docs/plans/2026-06-04-hebrew-translator-pdf-overlay-design.md` (🔴 guardrails = acceptance criteria). **Branch:** `feat/pdf-overlay`. **Test:** `npm test -- <path>`.

---

### Task 1: Add deps

```bash
npm install pdf-lib @pdf-lib/fontkit --legacy-peer-deps
node -e "require('pdf-lib'); require('@pdf-lib/fontkit'); console.log('ok')"
git add package.json package-lock.json
git commit -m "build: add pdf-lib + @pdf-lib/fontkit for PDF overlay"
```

---

### Task 2: Block grouping (pure) + `extractBlocks`

**Files:** Create `server/services/pdfOverlay.js` + `server/services/__tests__/pdfOverlay.group.test.js`.

Export a **pure** `groupBlocks(items, opts)` and an async `extractBlocks(buffer)`.

`groupBlocks(items, { yTol = 3, blockGapFactor = 1.6 } = {})`:
- `items`: `[{ x, y, width, height, str }]` (one page, top-left origin).
- Drop items whose `str.trim()` is empty.
- Sort by `y` then `x`. Cluster into **lines**: a new line when `|item.y - currentLineY| > yTol`. Within a line, sort items by `x`, `text = items.map(i=>i.str).join(' ')`, `bbox` = union (minX,minY,maxX-minX,maxY-minY), `lineHeight` = max item height.
- Group consecutive lines into **blocks**: start a new block when the vertical gap `line.y - (prevLine.y + prevLine.height) > prevLine.height * blockGapFactor`. Block `bbox` = union of its lines; `content` = lines' text joined by `' '`.
- Return `[{ bbox:{x,y,w,h}, content, lines:[{bbox,text}] }]`.

**Step 1 — failing test:**
```javascript
import { describe, it, expect } from 'vitest';
import { groupBlocks } from '../pdfOverlay.js';

const it_ = (x,y,w,h,str) => ({ x, y, width:w, height:h, str });

it('groups items into lines and blocks', () => {
  const items = [
    it_(50, 100, 20, 10, 'Hello'), it_(75, 100, 20, 10, 'world'),   // line 1
    it_(50, 112, 30, 10, 'second'),                                   // line 2 (same block, small gap)
    it_(50, 200, 30, 10, 'far'),                                      // line 3 (new block, big gap)
  ];
  const blocks = groupBlocks(items, { yTol: 3, blockGapFactor: 1.6 });
  expect(blocks.length).toBe(2);
  expect(blocks[0].content).toBe('Hello world second');
  expect(blocks[1].content).toBe('far');
  expect(blocks[0].bbox.x).toBe(50);
});

it('drops empty items', () => {
  expect(groupBlocks([it_(0,0,5,5,'   '), it_(0,0,5,5,'x')]).length).toBe(1);
});
```

**Step 2:** `npm test -- server/services/__tests__/pdfOverlay.group` → FAIL.
**Step 3:** implement `groupBlocks`. Then implement `extractBlocks(buffer)`:
```javascript
const { PDFExtract } = require('pdf.js-extract');
function extractBlocks(buffer) {
  return new Promise((resolve, reject) => {
    new PDFExtract().extractBuffer(buffer, {}, (err, data) => {
      if (err) return reject(err);
      const pages = (data && data.pages) || [];
      let total = 0;
      const blocks = [];
      pages.forEach((pg, pi) => {
        const items = (pg.content || []).map(c => ({ x:c.x, y:c.y, width:c.width, height:c.height, str:c.str }));
        total += items.filter(i => i.str && i.str.trim()).length;
        const pw = (pg.pageInfo && pg.pageInfo.width) || pg.width;
        const ph = (pg.pageInfo && pg.pageInfo.height) || pg.height;
        groupBlocks(items).forEach(b => blocks.push({ ...b, page: pi, pageWidth: pw, pageHeight: ph }));
      });
      resolve({ blocks, noTextLayer: total === 0 });
    });
  });
}
module.exports = { groupBlocks, extractBlocks };
```
**Step 4:** PASS (2). **Step 5:** commit `feat: PDF block grouping + extractBlocks`.

---

### Task 3: Coordinate conversion + wrap/auto-fit (pure)

**Files:** Modify `server/services/pdfOverlay.js`; create `server/services/__tests__/pdfOverlay.layout.test.js`.

Add and export:
- `toPdfRect(bbox, pageHeight)` → `{ x: bbox.x, y: pageHeight - bbox.y - bbox.h, w: bbox.w, h: bbox.h }` (top-left → pdf-lib bottom-left).
- `wrapAndFit(text, boxW, boxH, measure, { max=14, min=6, lineGap=1.15 })` where `measure(str, size)` → width in pt. Returns `{ size, lines:[string] }`. Algorithm: for `size` from `max` down to `min` step 1: greedily word-wrap `text` to `boxW` using `measure`; if `lines.length * size * lineGap <= boxH` → return. If none fit, return the `min`-size wrap (overflow allowed, never clip).

**Step 1 — failing test:**
```javascript
import { describe, it, expect } from 'vitest';
import { toPdfRect, wrapAndFit } from '../pdfOverlay.js';

it('converts top-left bbox to pdf bottom-left', () => {
  expect(toPdfRect({ x:10, y:20, w:30, h:8 }, 100)).toEqual({ x:10, y:72, w:30, h:8 });
});

it('wraps and fits within the box', () => {
  const measure = (s, size) => s.length * size * 0.5;       // fake: 0.5pt per char per size unit
  const r = wrapAndFit('aaaa bbbb cccc dddd', 40, 100, measure, { max:12, min:6 });
  expect(r.lines.length).toBeGreaterThan(1);
  expect(r.size).toBeLessThanOrEqual(12);
  expect(r.size).toBeGreaterThanOrEqual(6);
});

it('falls back to min size on tiny box (overflow, no crash)', () => {
  const measure = (s, size) => s.length * size;
  const r = wrapAndFit('verylongword', 5, 5, measure, { max:12, min:6 });
  expect(r.size).toBe(6);
  expect(Array.isArray(r.lines)).toBe(true);
});
```

**Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS (3). **Step 5:** commit `feat: PDF coord conversion + wrap/auto-fit helpers`.

---

### Task 4: `renderOverlay` (pdf-lib)

**Files:** Modify `server/services/pdfOverlay.js`; create `server/services/__tests__/pdfOverlay.render.test.js`.

`async renderOverlay(buffer, blocks)` where each block = `{ page, bbox, pageHeight, target }` (target = translated text; skip blocks without a non-empty string target):
- `const { PDFDocument, rgb } = require('pdf-lib'); const fontkit = require('@pdf-lib/fontkit');`
- `const pdf = await PDFDocument.load(buffer); pdf.registerFontkit(fontkit);`
- `const fontBytes = require('fs').readFileSync(path.join(__dirname,'assets','fonts','DejaVuSans.ttf')); const font = await pdf.embedFont(fontBytes, { subset:true });`
- group blocks by page; for each block: `const page = pdf.getPages()[block.page];` `const r = toPdfRect(block.bbox, block.pageHeight || page.getHeight());`
  - white-out: `page.drawRectangle({ x:r.x, y:r.y, width:r.w, height:r.h, color: rgb(1,1,1) });`
  - `const { size, lines } = wrapAndFit(block.target, r.w, r.h, (s,sz)=>font.widthOfTextAtSize(s,sz), { max: Math.min(14, r.h), min:6 });`
  - draw lines from the top of the box down: `let ty = r.y + r.h - size;` for each line: `page.drawText(line, { x:r.x, y:ty, size, font, color: rgb(0,0,0) }); ty -= size*1.15;`
- `return Buffer.from(await pdf.save());`

**Step 1 — failing test** (generate a 1-page PDF with pdf-lib, render, re-load):
```javascript
import { describe, it, expect } from 'vitest';
import { renderOverlay } from '../pdfOverlay.js';
import { PDFDocument } from 'pdf-lib';

async function makePdf() {
  const d = await PDFDocument.create();
  const p = d.addPage([200, 200]);
  p.drawText('original', { x: 20, y: 170, size: 12 });
  return Buffer.from(await d.save());
}

it('renders an overlay PDF that re-loads, page count preserved', async () => {
  const buf = await makePdf();
  const blocks = [{ page:0, pageHeight:200, bbox:{ x:20, y:20, w:160, h:14 }, target:'Привет мир' }];
  const out = await renderOverlay(buf, blocks);
  expect(Buffer.isBuffer(out)).toBe(true);
  const re = await PDFDocument.load(out);
  expect(re.getPageCount()).toBe(1);
  expect(out.length).toBeGreaterThan(0);
});

it('skips blocks without a string target without crashing', async () => {
  const buf = await makePdf();
  const out = await renderOverlay(buf, [{ page:0, pageHeight:200, bbox:{x:0,y:0,w:10,h:10}, target:null }]);
  await expect(PDFDocument.load(out)).resolves.toBeTruthy();
});
```

**Step 2:** FAIL. **Step 3:** implement (require `path`). **Step 4:** PASS (2). **Step 5:** commit `feat: PDF renderOverlay (copy pages, white-out, fitted text)`.

---

### Task 5: Wire into the worker (pdf branch + fallback)

**Files:** Modify `server/api/translate.js`. Create `server/services/__tests__/pdfOverlay.integration.test.js`.

In the processor, add a PDF branch parallel to the existing docx branch (read the current handler — it has `ext === 'docx'` then `if (!usedInplace)` flat path):
```javascript
} else if (ext === 'pdf') {
  try {
    const buffer = await fs.readFile(filePath);
    const { blocks: pblocks, noTextLayer } = await extractBlocks(buffer);
    if (noTextLayer || pblocks.length === 0) throw new Error('no text layer (scanned?)');
    const blocks = pblocks.map(b => ({ type:'paragraph', content:b.content }));
    const { blocks: docBlocks, segments } = buildSegments(blocks);
    if (docBlocks.length !== pblocks.length) throw new Error('block/segment mismatch');
    await job.progress(40);
    doc = await buildTranslationDocument({ blocks: docBlocks, segments },
      (chunk) => aiProvider.translateBatchAligned(chunk, sourceLang||'he', targetLang),
      { sourceLang: sourceLang||'he', targetLang, maxSegments: MAX_SEGMENTS, concurrency:2, maxPerChunk:8, maxTokens:1200, owner:'anon', jobId:String(job.id), ts: Date.now(), onCap:(i)=>console.warn(`cap ${i.total}>${i.cap}`) });
    await job.progress(80);
    const overlayBlocks = pblocks.map((b, i) => ({ page:b.page, bbox:b.bbox, pageHeight:b.pageHeight, target: docBlocks[i].sentences.map(s=>s.target).join(' ') }));
    const outBuf = await renderOverlay(buffer, overlayBlocks);
    outputPath = path.join(path.dirname(filePath), `translated_${crypto.randomUUID()}.pdf`);
    await fs.writeFile(outputPath, outBuf);
    usedInplace = true;
  } catch (e) { console.warn('PDF overlay failed, falling back to flat:', e.message); }
}
```
Place this `else if` right after the `if (ext === 'docx') {...}` block and before the `if (!usedInplace)` flat fallback (so PDF overlay failures fall through to flat). Add import `const { extractBlocks, renderOverlay } = require('../services/pdfOverlay');`. The existing page-cap (`MAX_PAGES`) is enforced inside `documentProcessor.processDocument` on the flat path; for the overlay path, pdf.js-extract reads all pages — add a guard: after extract, if `pblocks` spans more pages than `MAX_PAGES` (max `b.page`+1 > MAX_PAGES) → throw to fall back (which enforces the cap). Implement that guard.

**Integration test** (`pdfOverlay.integration.test.js`): generate a text PDF (pdf-lib) → `extractBlocks` → if it yields blocks, fake-translate (uppercase) → `renderOverlay` → re-load valid + page count preserved. (If `extractBlocks` yields no blocks for a pdf-lib-generated PDF in this environment, assert `noTextLayer===false` is not guaranteed — in that case skip the extract assertion and test `renderOverlay` directly with hand-built blocks. Note which path you took.)

**Verify:** `npm test -- server/services/__tests__/pdfOverlay` (all), `npm test` full (no new failures), `node -e "require('./server/api/translate.js'); console.log('loads'); process.exit(0)"`, grep `extractBlocks`/`renderOverlay` in translate.js.

**Commit:** `feat: wire PDF overlay into worker with flat fallback + page cap`.

---

### Task 6: Deploy + verify

- Merge `feat/pdf-overlay` → main (PR). On sec: `git pull && docker compose -f docker-compose.prod.yml up -d --build app`.
- Verify on https://translator.creatman.site: upload the real Hebrew geotech PDF (he→en), download — confirm it's a PDF that opens, text translated, images/layout preserved (vs the old flat bare text). Confirm DOCX still in-place; confirm a scanned/image-only PDF falls back without error. Log to memory.

## Acceptance criteria (design 🔴)
- [ ] Page cap enforced on overlay path (Task 5)
- [ ] No-text-layer → fallback flat (Task 5)
- [ ] Any render/extract error → fallback flat; job never fails; no corrupt PDF (Task 5)
- [ ] Coordinate conversion correct (Task 3 test)
- [ ] Overflow: shrink-to-min then allow (no clip) (Task 3)
- [ ] One translation pass; PDF output preserves images/layout
