# Hebrew Translator — DOCX in-place pixel-faithful (design)

**Date:** 2026-06-04
**Status:** Approved (design-lock)
**Builds on:** Phase 1 (segment-aligned pipeline + viewer, live). This is the first pixel-faithful **file output** sub-phase. PDF positional overlay is the next sub-phase after this.

## Goal
For DOCX input, produce a downloadable translated `.docx` that preserves the original layout, images, tables, and paragraph styles by editing the original `word/document.xml` **in place** (paragraph-level), instead of regenerating a bare document.

## Decisions (locked)
| Topic | Decision |
|-------|----------|
| First format | DOCX in-place (PDF overlay = next sub-phase) |
| Write-back granularity | **Paragraph-level**: translated paragraph → first `w:t` run; other runs blanked |
| Translation passes | **One** — XML-paragraph extraction feeds both the viewer and the in-place writer |
| Libs | `jszip` (zip r/w) + `@xmldom/xmldom` (XML DOM) |

## Architecture

### Extraction (`docx` input → blocks + retained XML)
- `jszip` opens the DOCX; read `word/document.xml`; parse to DOM (`@xmldom/xmldom`).
- Walk body `w:p` paragraphs (including those inside table cells `w:tc`). For each non-empty paragraph at index `pIndex`, the block content = concatenation of its `w:t` run texts. Produce blocks `{ id, type:'paragraph', pIndex, content }` → `buildSegments` → `TranslationDocument` (sentences) as in Phase 1.
- Retain the parsed DOM + JSZip instance for write-back.

### Translation
- Same batch-aligned translator (Groq primary, Claude fallback). One pass. Per block, the paragraph translation = the joined sentence targets.

### Write-back (in-place, paragraph-level)
- For each block: locate `w:p[pIndex]`; set the FIRST `w:t` text = NFC(target); set remaining `w:t` in that paragraph to empty. Preserve paragraph props, first-run props, images, tables, drawings — everything else untouched.
- Serialize DOM → overwrite the `word/document.xml` entry in the zip → emit `.docx`.

### Integration
- Worker: `.docx` input → XML extractor + in-place writer (downloadable file). `.pdf` input → current path until the PDF-overlay sub-phase.
- Viewer unchanged (same `TranslationDocument`).

## Error handling
- Paragraph with no runs / image-only → skipped (left as-is).
- Missing translation for a block (graceful) → leave the original text (do not blank).
- Unparseable / unexpectedly complex docx → **fall back to the existing flat `generateDOCX`** so the download always works.
- `xml:space="preserve"` respected; NFC normalize.

## Guardrails (design-guardrails-audit) — 🔴 = acceptance criteria
1. 🔴 **Zip-bomb on read** — run existing `assertDocxSafe` (uncompressed-size cap) before JSZip extraction on the in-place path.
2. 🔴 **XXE / entity expansion** — parsing untrusted `document.xml` must not resolve external entities; reject `DOCTYPE`/DTD (`@xmldom/xmldom` does not resolve external entities by default — verify + guard against DOCTYPE / billion-laughs).
3. 🔴 **Output integrity** — minimal edits (only `w:t` text); re-parse the serialized XML to validate; **fall back to flat `generateDOCX` on any error** (never emit a corrupt file / never fail the job).
4. 🟡 Headers/footers/footnotes (separate XML parts) NOT translated in v1 — explicit log/note, not silent.
5. 🟡 Memory/size bounded by the existing file-size cap.
6. 🟡 Cost — single translation pass (no double LLM calls).
7. 🟢 Deterministic NFC normalization.

## Testing
- Unit: paragraph extractor (generate a fixture `.docx` via the `docx` dep → extract → assert paragraphs + `pIndex`); write-back (inject translations → re-parse → first run replaced, others blank, structure intact); fallback on malformed input.
- Integration: round-trip a generated `.docx` → translate (mock) → output re-parses and contains the translated text.

## Scope (YAGNI)
**In:** DOCX body paragraphs (incl. table cells) in-place, paragraph-level, fallback to flat on error, one translation pass.
**Out:** headers/footers/footnotes, intra-paragraph run formatting, PDF overlay (next sub-phase).
