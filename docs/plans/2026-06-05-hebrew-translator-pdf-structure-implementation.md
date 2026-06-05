# PDF → structure → clean DOCX — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the failed PDF overlay: digital PDF → extract positioned text → one LLM call/page reconstructs a clean ordered `StructuredDoc` (headings/paragraphs/lists/tables) AND translates → render an editable DOCX + a structured side-by-side viewer. Fallback to flat on error/scanned.

**Architecture:** `pdf.js-extract` raw items → `pdfStructure` (Groq via a new `chatJSON` provider method) → `StructuredDoc` (schemaVersion 2) → `structuredDocx` (docx lib) for download + a `StructuredViewer` (React) keyed on schemaVersion. Worker's PDF branch swaps overlay → structure; flat fallback retained.

**Tech Stack:** pdf.js-extract, docx (present), LiteLLM/Groq, React, vitest.

**Design:** `docs/plans/2026-06-05-hebrew-translator-pdf-structure-design.md` (🔴 guardrails = acceptance criteria). **Branch:** `feat/pdf-structure`. **Test:** `npm test -- <path>` (server), CRA for client.

`StructuredDoc`:
```jsonc
{ schemaVersion:2, sourceLang, targetLang, usage,
  elements:[ {type:'heading',level,source,target}, {type:'paragraph',source,target},
             {type:'list',ordered,items:[{source,target}]}, {type:'table',rows:[[{source,target}]]} ] }
```

---

### Task 1: `structuredDocx` renderer

**Files:** Create `server/services/structuredDocx.js` + `server/services/__tests__/structuredDocx.test.js`.

`async renderStructuredDocx(structuredDoc)` → Buffer. Map elements (use the `docx` dep, `import * as docx`):
- heading → `new docx.Paragraph({ text: el.target, heading: ['Heading1','Heading2','Heading3'][Math.min((el.level||1)-1,2)] })`
- paragraph → `new docx.Paragraph({ children:[new docx.TextRun(el.target||'')] })`
- list → for each item `new docx.Paragraph({ children:[new docx.TextRun(it.target||'')], bullet: el.ordered ? undefined : { level:0 }, numbering: el.ordered ? { reference:'num', level:0 } : undefined })` (simplest: bullet for unordered; for ordered, prefix "1. " into text if numbering config is fiddly — acceptable v1).
- table → `new docx.Table({ rows: el.rows.map(r => new docx.TableRow({ children: r.map(c => new docx.TableCell({ children:[new docx.Paragraph(c.target||'')] })) })) })`
Build `new docx.Document({ sections:[{ children:[...] }] })` → `docx.Packer.toBuffer`.

**Test:**
```javascript
import { describe, it, expect } from 'vitest';
import * as docx from 'docx';
import { renderStructuredDocx } from '../structuredDocx.js';
import { extractParagraphs } from '../docxInplace.js';

it('renders headings/paragraphs/lists/tables to a valid docx', async () => {
  const sd = { schemaVersion:2, sourceLang:'he', targetLang:'en', elements:[
    { type:'heading', level:1, source:'כותרת', target:'Title' },
    { type:'paragraph', source:'פסקה', target:'A paragraph' },
    { type:'list', ordered:false, items:[{source:'א',target:'Apple'},{source:'ב',target:'Banana'}] },
    { type:'table', rows:[[{source:'ש',target:'Name'},{source:'ג',target:'Age'}],[{source:'x',target:'Bob'},{source:'y',target:'30'}]] },
  ]};
  const buf = await renderStructuredDocx(sd);
  expect(Buffer.isBuffer(buf)).toBe(true);
  const texts = (await extractParagraphs(buf)).paragraphs.map(p=>p.content);
  expect(texts).toContain('Title');
  expect(texts).toContain('A paragraph');
  expect(texts.join(' ')).toContain('Apple');
  expect(texts.join(' ')).toContain('Name');   // table cell text present
  expect(texts.join(' ')).toContain('Bob');
});
```
TDD: fail → implement → pass. Commit `feat: StructuredDoc -> editable DOCX renderer`.

---

### Task 2: `LiteLLMProvider.chatJSON` (generic JSON chat)

**Files:** Modify `server/adapters/ai/LiteLLMProvider.js`; test `server/adapters/ai/__tests__/litellmChatJson.test.js`.

Add `async chatJSON(system, user, { model } = {})`: POST `/chat/completions` with `model: model||this.model`, messages [system,user], `temperature:0`, `response_format:{type:'json_object'}`, batch timeout. Return `{ content, usage }` where content = `data.choices[0].message.content` (string), usage = `{model:data.model||this.model, promptTokens, completionTokens, totalTokens, costUsd}` (same parsing as `translateBatchAligned`). On non-ok → throw.

Test (mock fetch): returns content + usage; model alias passed; non-ok throws. Commit `feat: LiteLLMProvider.chatJSON generic structured call`.

---

### Task 3: `pdfStructure` (extract + LLM restructure+translate)

**Files:** Create `server/services/pdfStructure.js` + `server/services/__tests__/pdfStructure.test.js`.

Export:
- `extractItems(buffer)` → `{ pages:[{ items:[{x,y,str}], width, height }], noTextLayer }` (pdf.js-extract; total non-empty items === 0 → noTextLayer).
- `normalizeElements(arr)` → keep only well-formed elements (`heading`{level,target}, `paragraph`{target}, `list`{items:[{target}]}, `table`{rows:[[{target}]]}); coerce/drop malformed; always returns an array (never throws).
- `buildPrompt(items, from, to)` → `{ system, user }` instructing reading-order reconstruction (RTL-aware), classification (heading/paragraph/list/table), translation, and **strict JSON** `{ "elements":[...] }` with `source`+`target` per text. `user` = JSON of items (`[{x,y,str}]`, rounded).
- `async structureAndTranslate(buffer, from, to, chatFn, { maxElementsPerPage=300 } = {})` where `chatFn(system, user)` → `{ content, usage }` (injected; prod passes `(s,u)=>provider.chatJSON(s,u)`). For each page: call chatFn(buildPrompt); parse JSON (strip ```json fences; try/catch); `normalizeElements(parsed.elements)`; on parse failure → degrade: one `paragraph` per non-empty item (source=str, target=str — i.e., leave source; better: a single paragraph of joined text). Accumulate usage (reuse `usage.js`). Return `{ structuredDoc:{ schemaVersion:2, sourceLang:from, targetLang:to, elements, usage:finalized }, noTextLayer }`.

**Tests** (fake chatFn, no network):
```javascript
import { describe, it, expect } from 'vitest';
import { normalizeElements, structureAndTranslate } from '../pdfStructure.js';

it('normalizeElements drops malformed, keeps valid', () => {
  const out = normalizeElements([
    { type:'heading', level:1, source:'a', target:'A' },
    { type:'paragraph', target:'P' },
    { type:'bogus' }, null, { type:'table', rows:[[{target:'c'}]] },
  ]);
  expect(out.map(e=>e.type)).toEqual(['heading','paragraph','table']);
});
```
For `structureAndTranslate`, the test passes a fake buffer? It calls `extractItems` (needs a real PDF). To avoid PDF generation in this unit test, split: test `normalizeElements` (pure) here; test `structureAndTranslate`'s orchestration in the integration task with a generated PDF. OR refactor `structureAndTranslate` to accept already-extracted `pages` so it's testable without a PDF: `async structurePages(pages, from, to, chatFn)` (pure-ish, fake chatFn). Implement `structureAndTranslate` = `extractItems` + `structurePages`. Test `structurePages` with synthetic pages + a fake chatFn returning canned JSON, plus a malformed-JSON case → degrades to paragraphs.

Commit `feat: pdfStructure (extract + LLM restructure/translate + normalize + fallback)`.

---

### Task 4: Wire worker (PDF → structure → DOCX; remove overlay)

**Files:** Modify `server/api/translate.js`. Create `server/services/__tests__/pdfStructure.integration.test.js`.

- Replace the `else if (ext === 'pdf') { ...overlay... }` block with:
```javascript
} else if (ext === 'pdf') {
  try {
    const buffer = await fs.readFile(filePath);
    const { structuredDoc, noTextLayer } = await structureAndTranslate(
      buffer, sourceLang || 'he', targetLang,
      (system, user) => aiProvider.chatJSON(system, user),
      { jobId: String(job.id) }
    );
    if (noTextLayer || !structuredDoc.elements.length) throw new Error('no text layer (scanned?)');
    await job.progress(80);
    doc = structuredDoc;                       // saved for the viewer (schemaVersion 2)
    const outBuf = await renderStructuredDocx(structuredDoc);
    outputPath = path.join(path.dirname(filePath), `translated_${crypto.randomUUID()}.docx`);  // PDF in -> DOCX out
    await fs.writeFile(outputPath, outBuf);
    usedInplace = true;
  } catch (e) { console.warn('PDF structure failed, falling back to flat:', e.message); }
}
```
- Imports: `const { structureAndTranslate } = require('../services/pdfStructure'); const { renderStructuredDocx } = require('../services/structuredDocx');`. Remove overlay imports (`extractBlocks, renderOverlay`) and delete `server/services/pdfOverlay.js` + its tests (now unused) — OR keep the file but stop importing it; prefer delete to avoid dead code (`git rm server/services/pdfOverlay.js server/services/__tests__/pdfOverlay.*.test.js`).
- Page-cap: enforce inside `structureAndTranslate`/`extractItems` (if pages.length > MAX_PAGES → throw → flat). Add MAX_PAGES guard there or in the worker after extract.
- Note: `saveResult(doc)` now stores a schemaVersion-2 doc for PDF; the result endpoint still strips `usage` and returns it. The client viewer branches on schemaVersion (Task 5).

**Integration test** (`pdfStructure.integration.test.js`): generate a text PDF (pdf-lib), `extractItems` → if items present, run `structurePages` with a fake chatFn that returns one heading+one paragraph JSON → assert `structuredDoc.elements` and then `renderStructuredDocx` → valid docx. (If no items in env, test `structurePages` + renderer directly.)

**Verify:** `npm test -- server/services` (structuredDocx, pdfStructure pass), `npm test` full (no new failures; overlay tests removed), `node -e "require('./server/api/translate.js'); console.log('loads')"`, grep `structureAndTranslate`/`renderStructuredDocx` in translate.js and confirm overlay refs gone.

**Commit:** `feat: wire PDF->structure->DOCX, remove overlay path`.

---

### Task 5: Structured viewer (client)

**Files:** Create `client/src/components/StructuredViewer.js` + test; modify `client/src/App.js` to branch on `translationDoc.schemaVersion`.

`StructuredViewer({ doc })` renders two columns (source | target) of `doc.elements`: heading (bold, sized by level), paragraph, list (`<ul>/<ol>` with `<li>`), table (`<table>`). **All text via React children; tables/lists via React elements (no dangerouslySetInnerHTML).** Element-level highlight: hovering/clicking an element index highlights the paired element on the other side (state = active index). Source column `dir="rtl"`.

In `App.js`: `{translationDoc && (translationDoc.schemaVersion === 2 ? <StructuredViewer doc={translationDoc}/> : <SideBySideViewer doc={translationDoc}/>)}`.

**Test** (CRA): render `<StructuredViewer doc={...}/>` with heading/paragraph/list/table → asserts target texts present; XSS fixture (element target with `<img>`) rendered literally. Commit `feat(client): StructuredViewer (element-level, schemaVersion 2)`.

---

### Task 6: Deploy + verify

- Merge `feat/pdf-structure` → main (PR). On sec: `git pull && docker compose -f docker-compose.prod.yml up -d --build app`.
- Verify on https://translator.creatman.site: upload the real Hebrew geotech PDF (he→en) → download = a clean **editable DOCX** with headings/list (the numbered clauses)/tables readable and correctly ordered (NOT mush); viewer shows structured source|target. Confirm DOCX-input still in-place; scanned/no-text PDF falls back to flat. Send the output DOCX to the operator for eyeball. Log to memory.

## Acceptance criteria (design 🔴)
- [ ] Malformed structured-output → degrade/flat; job never fails (Tasks 3,4)
- [ ] Element/token cap + page cap; explicit log (Tasks 3,4)
- [ ] No-text/scanned → flat fallback (Task 4)
- [ ] Unreliable tables → paragraphs, no broken tables (Task 3 normalize)
- [ ] Viewer XSS-safe (Task 5)
- [ ] PDF in → clean editable DOCX out, structured & ordered; overlay removed
