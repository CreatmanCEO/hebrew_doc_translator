# Hebrew Translator — PDF positional overlay (block-reflow) design

**Date:** 2026-06-04
**Status:** Approved (design-lock)
**Builds on:** DOCX in-place (live). This is the second/last pixel-faithful file sub-phase. Scanned-PDF OCR remains a separate future phase.

## Goal
For digital PDF uploads, produce a translated PDF that preserves images, vector graphics, and overall layout by copying the original pages and replacing each text block in place with its translation (reflowed + auto-fit within the block region). Scanned PDFs (no text layer) gracefully fall back to the existing flat path.

## Decisions (locked)
| Topic | Decision |
|-------|----------|
| Overlay granularity | **Block-level reflow** (group lines→paragraphs; translate block; white-out region; draw wrapped, auto-fit translation) |
| Layout preservation | Copy original pages (images/vectors/other blocks intact); only text-block regions replaced |
| Translation passes | One — block extraction feeds both viewer and overlay |
| Libs | `pdf.js-extract` (present) for extraction; `pdf-lib` + `@pdf-lib/fontkit` for render; `DejaVuSans.ttf` (present) embedded |
| Scanned PDFs | Out of scope → fallback flat (OCR future) |

## Architecture

### Extraction — `server/services/pdfOverlay.js: extractBlocks(buffer)`
- `pdf.js-extract` → per page: items `{x, y, w, h, str, fontName}` + `pageWidth/pageHeight` (top-left origin).
- Group items into **lines** (cluster by y within tolerance; sort by x). Group lines into **blocks/paragraphs** (vertical-gap threshold + left-x alignment).
- Each block: `{ page, bbox:{x,y,w,h} (union of its lines, top-left origin), content (lines joined), lines:[{bbox,text}] }`.
- If total text items across all pages is 0 → return a `noTextLayer: true` signal (caller falls back).

### Translation
- blocks → `buildSegments` → `buildTranslationDocument` (Groq primary, one pass). Per-block target = joined sentence targets. Reused by the viewer.

### Render — `renderOverlay(buffer, blocksWithTargets)`
- `pdf-lib`: load the original PDF (preserves images/vectors); register `@pdf-lib/fontkit`; embed `DejaVuSans.ttf` once (subset).
- For each block with a translation: on its page, convert bbox to pdf-lib coords (bottom-left: `y' = pageHeight - y - h`). Draw a white rectangle over the block region (cover original text). Draw the translated text wrapped to the region width with **auto-fit font size**: start near the original size, shrink to fit width+height, floor ≈ 6pt; if it still overflows, allow overflow (never clip — don't lose text).
- Save → PDF buffer.

### Integration (worker)
- `.pdf` input → `extractBlocks`; if `noTextLayer` or any error → **fallback to the current flat path**. Else translate (one pass; `saveResult` for viewer) → `renderOverlay` → output PDF. `.docx` path (in-place) unchanged.

## Error handling
- No text layer (scanned) → fallback flat (note: OCR is a future phase).
- Any extraction/render error → fallback flat (download never breaks, job never fails).
- Missing translation for a block → leave the original (do not white-out).
- Missing glyph (e.g., retained Hebrew) → DejaVu lacks Hebrew; output is en/ru so fine — documented edge case.

## Guardrails (design-guardrails-audit) — 🔴 = acceptance criteria
1. 🔴 **Page cap** — enforce existing `MAX_PAGES` before/at pdf.js extraction (DoS).
2. 🔴 **No-text-layer detection → fallback** — never emit a blank/garbage overlay PDF.
3. 🔴 **Render error → fallback flat** — job never fails; never emit a corrupt PDF.
4. 🟡 Coordinate conversion correctness (top-left ↔ bottom-left) — unit-tested on a known bbox.
5. 🟡 Overflow policy — shrink-to-floor then allow overflow (no clipping), explicit.
6. 🟡 Memory — bounded by existing file-size + page caps.
7. 🟡 One translation pass (cost).
8. 🟢 Font embedded once (subset) per document.

## Testing
- Unit: line/block grouping (synthetic items → expected blocks); coordinate conversion; auto-fit font calc (short text → base size, long text → shrinks to floor).
- Render: a generated 1-page PDF + block mapping → `renderOverlay` returns a valid PDF (pdf-lib re-load succeeds, page count preserved).
- Integration: `extractBlocks` on a generated text PDF → blocks; fake-translate → `renderOverlay` → re-loads valid. Fallback path on a no-text PDF.

## Scope (YAGNI)
**In:** digital-PDF block-reflow overlay (images/vectors preserved), auto-fit, fallback flat on error/scanned, one translation pass.
**Out:** scanned-PDF OCR, pixel-exact per-line positioning, Hebrew-glyph output, table structure reconstruction (drawn vectors stay as-is).
