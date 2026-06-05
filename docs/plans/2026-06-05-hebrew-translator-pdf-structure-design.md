# Hebrew Translator — PDF → structure → clean DOCX (design)

**Date:** 2026-06-05
**Status:** Approved (design-lock)
**Supersedes:** the PDF positional-overlay sub-phase (PR #14), which produced unreadable output on real RTL/multi-column/table documents (Hebrew showing through, English misplaced, lists/tables turned to mush). Overlay is the wrong tool for structured docs.

## Goal
For digital PDF input: extract positioned text → an LLM reconstructs a clean, correctly-ordered document (headings, paragraphs, lists, tables; RTL fixed) **and** translates it → render a clean, **editable DOCX** (PDF in → DOCX out) + a structured side-by-side HTML viewer. Scanned PDFs and a future PaddleOCR-VL engine feed the same structured format.

## Decisions (locked)
| Topic | Decision |
|-------|----------|
| Direction | parse → translate → **clean re-render** (not overlay) |
| Engine (now) | **LLM-restructure** (Groq) of pdf.js-extract positioned text — no GPU, in-stack, free, digital-only |
| Engine (later) | PaddleOCR-VL (vision) for scanned PDFs — separate, feeds same format |
| Download output | **clean editable DOCX** (headings/lists/tables native) |
| Viewer | structured HTML side-by-side, element-level highlight (no word-align in v1) |
| Overlay path | **removed/replaced** |

## Common format: `StructuredDoc` (schemaVersion 2)
```jsonc
{ schemaVersion: 2, sourceLang, targetLang, usage,
  elements: [
    { type:'heading', level, source, target },
    { type:'paragraph', source, target },
    { type:'list', ordered, items:[{ source, target }] },
    { type:'table', rows:[[{ source, target }, ...], ...] }
  ] }
```
Both engines emit this; translation, DOCX renderer, and viewer consume it.

## Engine now — `server/services/pdfStructure.js` (LLM restructure+translate)
- Extract raw positioned items per page via `pdf.js-extract` (`{x,y,str}`).
- Per page: ONE Groq call (structured JSON output): "Given these positioned text fragments, reconstruct the document in correct reading order (RTL-aware), classify headings / paragraphs / ordered+unordered lists / tables, and translate each text from {src} to {target}. Return JSON elements." → source+target in one pass.
- Robustness: per-page; chunk an over-large page to stay under token limits; malformed JSON → that page degrades (paragraphs) or whole job → flat fallback.
- Tables are the hardest (infer rows/cols from coordinates); if unreliable, degrade to paragraphs — never emit broken tables.
- `noTextLayer` (scanned) → signal → caller falls back.

## DOCX renderer — `server/services/structuredDocx.js`
- `StructuredDoc.elements` → `docx` lib: heading→`HeadingLevel`, paragraph→`Paragraph`, list→numbered/bulleted paragraphs, table→`docx.Table` (target text in cells). Editable; tables native. No font embedding (Word renders).

## Viewer
- `StructuredDoc` → structured HTML side-by-side (source | target) rendering headings/lists/tables. **Element-level** highlight (click element → highlight paired). React text nodes only (XSS-safe); tables/lists built via React elements, never `dangerouslySetInnerHTML`. Word-level alignment is NOT in v1 for this path.

## Integration (worker)
PDF → `pdfStructure` (LLM) → `StructuredDoc` (`saveResult` for viewer) → `structuredDocx` → `.docx` output. **Replaces the overlay branch.** No-text-layer / scanned / any error → **fallback to flat** (readable). DOCX-input in-place path unchanged. Remove the now-unused overlay wiring (and `pdfOverlay.js` if fully unused).

## Guardrails (design-guardrails-audit) — 🔴 = acceptance criteria
1. 🔴 Malformed structured-output → per-page degrade + flat fallback; job never fails.
2. 🔴 Token/element cap — chunk large pages; ceiling on elements; explicit log on truncation.
3. 🔴 No-text-layer/scanned → fallback flat (never emit garbage).
4. 🟡 Unreliable table inference → degrade to paragraphs (no broken tables).
5. 🟡 Viewer XSS — tables/lists via React elements only.
6. 🟡 Cost/RPM (Groq per-page) bounded; privacy (Groq free-tier data policy — note).
7. 🟢 No font embedding for DOCX output.

## Testing
- Unit: `structuredDocx` (elements→docx; re-extract paragraphs + a table); `pdfStructure` adapter (mock structured output → StructuredDoc; malformed → degrade).
- Integration: positioned items → (mock) restructure → DOCX renders valid (re-open).
- Fallback: no-text PDF → flat.

## Scope (YAGNI)
**In:** digital PDF → LLM structure+translate → clean editable DOCX + structured element-level viewer; remove overlay; fallback flat.
**Out:** PaddleOCR-VL/scanned (next engine), word-level alignment in the structured viewer, Chromium PDF output.
