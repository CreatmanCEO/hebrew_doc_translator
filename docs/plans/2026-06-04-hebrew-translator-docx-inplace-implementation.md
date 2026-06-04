# DOCX in-place pixel-faithful — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** For DOCX uploads, produce a translated `.docx` that preserves layout/images/tables by editing `word/document.xml` in place (paragraph-level), instead of regenerating a bare doc.

**Architecture:** Unzip DOCX (`jszip`), parse `word/document.xml` (`@xmldom/xmldom`), extract body `w:p` paragraphs (incl. table cells) as blocks → existing segment translator (one pass) → write each paragraph's translation into its first `w:t` run (blank the rest) → repackage. Falls back to the existing flat `generateDOCX` on any error.

**Tech Stack:** Node, jszip, @xmldom/xmldom, existing pipeline (buildSegments/buildTranslationDocument), vitest. `docx` dep used to generate test fixtures.

**Design:** `docs/plans/2026-06-04-hebrew-translator-docx-inplace-design.md` (🔴 guardrails = acceptance criteria). **Branch:** `feat/docx-inplace`. **Test:** `npm test -- <path>`.

---

### Task 1: Add deps

```bash
npm install jszip @xmldom/xmldom --legacy-peer-deps
git add package.json package-lock.json
git commit -m "build: add jszip + @xmldom/xmldom for DOCX in-place"
```
Verify: `node -e "require('jszip'); require('@xmldom/xmldom'); console.log('ok')"`.

---

### Task 2: `extractParagraphs` (DOCX → blocks, XXE-guarded)

**Files:** Create `server/services/docxInplace.js` + `server/services/__tests__/docxInplace.extract.test.js`.

**Step 1 — failing test** (build a real fixture with the `docx` dep):
```javascript
import { describe, it, expect } from 'vitest';
import docx from 'docx';
import { extractParagraphs } from '../docxInplace.js';

async function makeDocx(paras) {
  const d = new docx.Document({ sections: [{ children: paras.map(t =>
    new docx.Paragraph({ children: [ new docx.TextRun(t) ] })) }] });
  return docx.Packer.toBuffer(d);
}

it('extracts non-empty paragraphs with pIndex and content', async () => {
  const buf = await makeDocx(['שלום עולם', '', 'Second para']);
  const { paragraphs, documentXml } = await extractParagraphs(buf);
  expect(paragraphs.length).toBe(2);                 // empty one skipped
  expect(paragraphs[0].content).toBe('שלום עולם');
  expect(typeof paragraphs[0].pIndex).toBe('number');
  expect(documentXml).toContain('w:p');
});

it('rejects DOCTYPE (XXE guard)', async () => {
  // craft a zip whose document.xml has a DOCTYPE
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('word/document.xml', '<?xml version="1.0"?><!DOCTYPE x><w:document/>');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  await expect(extractParagraphs(buf)).rejects.toThrow(/DOCTYPE|entity/i);
});
```
Note `docx` is ESM-namespace — if `import docx from 'docx'` is undefined, use `import * as docx from 'docx'` (seen earlier in this repo).

**Step 2:** `npm test -- server/services/__tests__/docxInplace.extract` → FAIL.

**Step 3 — implement** in `server/services/docxInplace.js`:
- `const JSZip = require('jszip'); const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');`
- `async function extractParagraphs(buffer)`:
  - `const zip = await JSZip.loadAsync(buffer);`
  - `const documentXml = await zip.file('word/document.xml').async('string');`
  - **XXE guard:** `if (/<!DOCTYPE/i.test(documentXml)) throw new Error('DOCTYPE not allowed (XXE)');`
  - `const dom = new DOMParser().parseFromString(documentXml, 'text/xml');`
  - `const ps = Array.from(dom.getElementsByTagName('w:p'));`
  - For each `p` at index `pIndex`: text = concat of `Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('')`. If `text.trim()` non-empty → push `{ pIndex, content: text }`.
  - return `{ paragraphs, zip, documentXml }`.
- `module.exports = { extractParagraphs };` (add writeBack in Task 3).

**Step 4:** PASS (2). **Step 5:** commit `feat: DOCX XML paragraph extractor (XXE-guarded)`.

---

### Task 3: `writeBack` (paragraph-level in-place)

**Files:** Modify `server/services/docxInplace.js`; create `server/services/__tests__/docxInplace.writeback.test.js`.

**Step 1 — failing test:**
```javascript
import { describe, it, expect } from 'vitest';
import docx from 'docx';
import { extractParagraphs, writeBack } from '../docxInplace.js';

async function makeDocx(paras) { /* same helper as Task 2 */ }

it('writes translations into first run, blanks others, round-trips', async () => {
  const buf = await makeDocx(['שלום עולם', 'Keep me']);
  const { paragraphs, zip, documentXml } = await extractParagraphs(buf);
  const mapping = {}; mapping[paragraphs[0].pIndex] = 'Hello world';
  const out = await writeBack(zip, documentXml, mapping);
  // re-extract from the output to verify
  const re = await extractParagraphs(out);
  const texts = re.paragraphs.map(p => p.content);
  expect(texts).toContain('Hello world');           // translated paragraph replaced
  expect(texts).toContain('Keep me');               // untouched paragraph preserved
});

it('throws on invalid mapping target type (caller falls back)', async () => {
  const buf = await makeDocx(['a']);
  const { paragraphs, zip, documentXml } = await extractParagraphs(buf);
  const m = {}; m[paragraphs[0].pIndex] = { not: 'a string' };
  await expect(writeBack(zip, documentXml, m)).rejects.toThrow();
});
```

**Step 2:** FAIL.

**Step 3 — implement** `async function writeBack(zip, documentXml, mapping)`:
- parse fresh DOM from `documentXml`.
- `const ps = Array.from(dom.getElementsByTagName('w:p'));`
- for each `pIndexStr` in mapping: `const text = mapping[pIndexStr];` if `typeof text !== 'string'` throw; `const p = ps[Number(pIndexStr)];` if !p continue; `const ts = Array.from(p.getElementsByTagName('w:t'));` if `ts.length === 0` continue; set `ts[0].textContent = text.normalize('NFC');` and set `ts[0].setAttribute('xml:space','preserve');`; for `ts.slice(1)` set `.textContent = ''`.
- `const outXml = new XMLSerializer().serializeToString(dom);`
- validate: re-parse `new DOMParser().parseFromString(outXml,'text/xml')` — if it has a `parsererror` element, throw.
- `zip.file('word/document.xml', outXml);`
- `return zip.generateAsync({ type: 'nodebuffer' });`
- export `writeBack`.

**Step 4:** PASS. **Step 5:** commit `feat: DOCX in-place writeBack (paragraph-level, validated)`.

---

### Task 4: Wire into the worker (docx branch + fallback)

**Files:** Modify `server/api/translate.js`.

Read the current `documentQueue.process('translate', ...)`. Add a DOCX branch BEFORE the existing flat path:
```javascript
const ext = path.extname(filePath).slice(1).toLowerCase();
let doc, outputPath, usedInplace = false;
if (ext === 'docx') {
  try {
    await assertDocxSafe(filePath, MAX_DOCX_UNCOMPRESSED);          // existing import? add if missing
    const buffer = await fs.readFile(filePath);
    const { paragraphs, zip, documentXml } = await extractParagraphs(buffer);
    const blocks = paragraphs.map(p => ({ type: 'paragraph', content: p.content }));
    const { blocks: docBlocks, segments } = buildSegments(blocks);
    if (docBlocks.length !== paragraphs.length) throw new Error('paragraph/segment count mismatch');
    doc = await buildTranslationDocument({ blocks: docBlocks, segments },
      (chunk) => aiProvider.translateBatchAligned(chunk, sourceLang || 'he', targetLang),
      { sourceLang: sourceLang || 'he', targetLang, maxSegments: MAX_SEGMENTS, concurrency: 2, maxPerChunk: 8, maxTokens: 1200, owner:'anon', jobId:String(job.id), ts: Date.now(),
        onCap:(i)=>console.warn(`cap ${i.total}>${i.cap}`) });
    const mapping = {};
    docBlocks.forEach((b, i) => { mapping[paragraphs[i].pIndex] = b.sentences.map(s => s.target).join(' '); });
    const outBuf = await writeBack(zip, documentXml, mapping);
    outputPath = path.join(path.dirname(filePath), `translated_${crypto.randomUUID()}.docx`);
    await fs.writeFile(outputPath, outBuf);
    usedInplace = true;
  } catch (e) {
    console.warn('DOCX in-place failed, falling back to flat:', e.message);
  }
}
if (!usedInplace) {
  // existing flat path: processDocument -> buildSegments -> buildTranslationDocument -> generateTranslatedDocument
  // (keep current code; ensure it sets `doc` and `outputPath`)
}
const resultToken = crypto.randomUUID();
saveResult(resultToken, doc);
await job.progress(100);
return { filename: path.basename(outputPath), resultToken, success: true };
```
- Add imports: `const { extractParagraphs, writeBack } = require('../services/docxInplace');` and ensure `assertDocxSafe` is imported (from `../services/zipGuard`) and `fs` is the promises fs already in the file.
- Keep the existing flat path as the `if (!usedInplace)` body (refactor current middle into it). Ensure both paths produce `doc` (for saveResult) and `outputPath`.

**Verify (no full unit test — needs LLM/redis):**
- `npm test` (full) → no new failures.
- `node -e "require('./server/api/translate.js'); console.log('loads'); process.exit(0)"`.
- Optional: a focused integration test `server/services/__tests__/docxInplace.integration.test.js` that runs extract → buildSegments → buildTranslationDocument(fakeBatch upper-casing) → mapping → writeBack → re-extract asserts uppercased text. (Recommended; uses fake batch, no network.)

**Commit:** `feat: wire DOCX in-place into worker with flat fallback`.

---

### Task 5: Deploy + verify

- Merge `feat/docx-inplace` → main (PR). On sec: `git pull && docker compose -f docker-compose.prod.yml up -d --build app`.
- Verify: generate a Hebrew `.docx` (multi-paragraph), upload to https://translator.creatman.site, download the result, confirm: opens in Word, paragraphs translated, layout/structure intact. Confirm a PDF upload still works (flat path unchanged). Log decision to memory.

---

## Acceptance criteria (design 🔴)
- [ ] Zip-bomb: `assertDocxSafe` runs before extraction (Task 4)
- [ ] XXE: DOCTYPE rejected (Task 2)
- [ ] Output integrity: serialized XML re-validated; any error → flat fallback, job never fails (Tasks 3,4)
- [ ] One translation pass (Task 4)
- [ ] DOCX output preserves layout (paragraph-level in place); PDF path unchanged
