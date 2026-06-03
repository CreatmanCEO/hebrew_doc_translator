# Hebrew Translator — Phase 1 Design: segment-aligned model + side-by-side viewer

**Date:** 2026-06-03
**Status:** Approved (design-lock)
**Builds on:** `2026-06-01-hebrew-translator-production-design.md` (Phase 0 live).

## Scope (locked)
Phase 1 delivers the **alignment foundation + a synchronized side-by-side viewer**, plus per-document budget tracking and the iOS download fix. Pixel-faithful file output (PDF overlay, DOCX in-place) is the **next** phase.

| Decision | Value |
|----------|-------|
| Formats (fidelity files) | both PDF+DOCX — but **next phase**; Phase 1 = viewer |
| Highlight granularity | all three: block → sentence → word |
| Word alignment source | LLM, **precomputed in the batch pass** (not lazy) — required by <1s click latency |
| Viewer rendering | HTML panes (source RTL / target LTR), not pixel-faithful |
| Budget tracking | per-document tokens + cost + actual model, admin-gated |

## 1. Foundation — `TranslationDocument` (canonical intermediate)
Pipeline becomes extract → structure → batch-translate(+align) → `TranslationDocument` JSON:
```jsonc
{ schemaVersion: 1, sourceLang, targetLang,
  usage: { byModel: { "gemini-2.0-flash": {calls,in,out,total,costUsd} }, totals: {...} },
  blocks: [ { id:"b1", type:"paragraph", sentences:[
    { id:"b1s1", source:"שלום עולם", target:"Hello world",
      srcTokens:["שלום","עולם"], tgtTokens:["Hello","world"],
      align:[ {src:[0],tgt:[0]}, {src:[1],tgt:[1]} ] } ] } ] }
```

**Pipeline:**
1. Extract (pdf-parse / mammoth) → blocks.
2. Split blocks → sentences via `Intl.Segmenter` (sentence granularity); NFC-normalize Hebrew first.
3. Tokenize source per sentence via `Intl.Segmenter` (word granularity) → `srcTokens` (server is the source of truth for tokens).
4. **Batch translate + align**: group sentences into chunks (≈15-20 segments / ~1.5k tokens, respecting block boundaries). One LLM call per chunk returns `[{id, target, align}, …]`. A few calls per document, not per-sentence.
5. Assemble `TranslationDocument`; store by random token (TTL) in the result store.

**Why precompute align:** <1s click latency forbids per-click LLM round-trips (first click would miss cache). Block/sentence highlight is free (shared ids, 1:1); word-align rides along in the same batch calls.

**Caching:** per chunk/sentence, key = `model + promptVersion + schemaVersion + langs + hash(text)`. Distinct namespace from Phase-0 string cache (value shape changed → collision = crash).

## 2. Viewer (frontend — new result screen)
- API: `GET /api/result/:token` → `TranslationDocument` (minus admin-only `usage`). `Cache-Control: private, no-store`.
- Two scrollable panes: **left = source** (`dir="rtl"`, `unicode-bidi: plaintext` per segment), **right = target** (LTR). Each word is a span carrying `data-block / data-sentence / data-token`.
- Interaction (bidirectional, from either pane):
  - hover/click a **word** → highlight aligned word(s) in the other pane via `align`;
  - click a **sentence** → highlight the paired sentence both sides;
  - **block** → highlight the block.
- **Rendered only via React text nodes** — never `dangerouslySetInnerHTML` for document content (XSS).
- Client renders the server's `srcTokens`/`tgtTokens` **as-is** (never re-tokenizes) so align indices line up.
- Keeps a **Download** button.

## 3. Budget tracking (admin)
- `LiteLLMProvider` returns `usage {model, promptTokens, completionTokens, totalTokens, costUsd}` from the response (`usage` + `x-litellm-response-cost` / `_hidden_params`). Capture the **actual** model (fallback-aware), not the alias.
- Worker aggregates across batch calls → `usage.byModel` + totals, stored with the result.
- Admin: per-document panel (`model · in/out tokens · $cost`) + `GET /api/admin/usage` (recent jobs). Gated by `ADMIN_KEY` env (minimal gate until real auth exists). Usage stripped from the public result payload.

## 4. iOS download fix
Replace blob + `a.download` with a direct anchor to the attachment URL (server already sends `Content-Disposition: attachment`) — reliable on iOS Safari.

## 5. Error handling (graceful degradation)
- Malformed batch JSON → per-item parse; bad item degrades to sentence-level (no crash), job continues.
- align out-of-range / not covering tokens → drop word-level for that sentence; sentence/block highlight still works.
- Sentence segmentation failure → whole block as one sentence.
- Keep Phase-0 guardrails (refusal/length-ratio).

## 6. Testing
Unit: `Intl.Segmenter` sentence/word wrappers, align validator (out-of-range→drop), `TranslationDocument` builder, usage aggregator. Adapter: structured-output mock (incl. malformed item). Integration: fixture → valid `TranslationDocument`. Frontend: clicking a word highlights the paired token; XSS fixture (text with `<script>`) renders inert. E2E optional (Playwright-MCP flaky here).

## 7. Best practices & guardrails (design-guardrails-audit, 2026-06-03)
🔴 = Phase-1 acceptance criteria.

1. 🔴 **XSS-safe rendering** — React text nodes only; zero `dangerouslySetInnerHTML` for doc/LLM content; lint/test guard. (Client currently clean — keep it.)
2. 🔴 **`/api/result/:token` hardening** — UUID token, format-validated, TTL, `Cache-Control: private, no-store` (payload holds full document text). Mirror download token pattern (`api/translate.js:74,229,238`).
3. 🔴 **align validation** — strict vs `srcTokens`/`tgtTokens`; invalid → graceful degrade, never crash.
4. 🔴 **structured-output robustness** — malformed JSON → per-item fallback, job survives.
5. 🔴 **consistent tokenization server↔client** — client renders server tokens as-is; NFC + `Intl.Segmenter`; correct RTL/bidi in source pane.
6. 🔴 **cache `schemaVersion`** — no collision with Phase-0 string cache.
7. 🔴 **segment cap** — bound segments/JSON size; on truncation, explicit `log` (no silent cap).
8. 🔴 **budget data admin-gated** — `ADMIN_KEY`; usage never in public payload.

🟡: per-document cost/RPM logging (correlation id=jobId, content redacted); cross-sentence context within chunks for coherence; cost accuracy via actual-model capture; in-flight cache dedup; DOM perf on very large docs (cap/virtualize).
🟢: scroll-sync panes; temperature=0 for align determinism.

Cross-cutting: align-quality eval fixture (in-range + coverage + 1:1 sentences); fail-fast schema validation.

## 8. Phase boundaries (YAGNI)
**In:** TranslationDocument pipeline (batch translate+align), side-by-side HTML viewer (3-level highlight), budget tracking (admin), iOS download fix, light UI refresh of the result/upload screens.
**Out (next phase):** pixel-faithful PDF overlay, DOCX in-place file output, scroll-sync, real user auth.
