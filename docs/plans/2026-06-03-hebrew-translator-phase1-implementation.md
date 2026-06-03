# Hebrew Translator — Phase 1 Implementation Plan (segment-aligned model + side-by-side viewer)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a segment-aligned `TranslationDocument` from each upload and a synchronized side-by-side HTML viewer (block/sentence/word highlight), plus per-document budget tracking (admin) and the iOS download fix.

**Architecture:** Extract → split into blocks→sentences (Intl.Segmenter) → whitespace-tokenize → **batch** translate+align (few LLM calls per doc, chunked) → `TranslationDocument` JSON stored by token → React viewer renders both panes from the JSON and highlights via the alignment map. Usage (tokens/cost/actual model) captured per LLM call and aggregated per job.

**Tech Stack:** Node ≥18 (`Intl.Segmenter`), Express, Bull/Redis, vitest, React (CRA)+MUI, LiteLLM proxy (Gemini primary).

**Design:** `docs/plans/2026-06-03-hebrew-translator-phase1-design.md`. Acceptance criteria = the 8 🔴 in design §7.

**Branch:** `feat/phase1-viewer` (design committed). **Test:** `npm test -- <path>` (server), client tests via CRA.

> **Decisions baked in:** tokenization = whitespace split (`text.split(/\s+/)`) — server emits `srcTokens`/`tgtTokens`, client renders them as-is (never re-tokenizes). `Intl.Segmenter` used only for sentence splitting. Word/sentence/block highlight; word-align precomputed in the batch pass.

---

### Task 0: Sync base (resolve stale local main)

Local `main` is behind remote (missing PR #9 font+speed). Before coding, sync so Phase 1 builds on the deployed state.

```bash
git checkout main && git pull origin main          # needs network; remote main = PR#9 merged
git checkout feat/phase1-viewer && git rebase main # bring font/speed under the design commits
npm test                                            # baseline green (server suite)
ls server/assets/fonts/DejaVuSans.ttf               # must exist (PR#9)
grep -c translateBlock server/core/translation/Translator.js  # >0 (PR#9 parallelization)
```
If network blocks GitHub, do it over the working VPN path first. Do NOT start Task 1 until `DejaVuSans.ttf` is present and `translateBlock` exists.

---

### Task 1: Sentence + token helpers

**Files:** Create `server/services/segmenter.js`, `server/services/__tests__/segmenter.test.js`.

**Step 1 — failing test:**
```javascript
import { describe, it, expect } from 'vitest';
import { splitSentences, tokenize, nfc } from '../segmenter.js';

it('splits into sentences', () => {
  const s = splitSentences('Hello world. How are you? Fine.');
  expect(s.length).toBe(3);
});
it('tokenizes on whitespace, drops empties', () => {
  expect(tokenize('  שלום   עולם ')).toEqual(['שלום','עולם']);
});
it('nfc-normalizes', () => {
  expect(nfc('é')).toBe('é');
});
```
**Step 2:** `npm test -- server/services/__tests__/segmenter` → FAIL.
**Step 3 — implement:** `nfc(s)=s.normalize('NFC')`; `tokenize(s)=nfc(s).trim().split(/\s+/).filter(Boolean)`; `splitSentences(s, locale='und')` using `Intl.Segmenter(locale,{granularity:'sentence'})` → array of trimmed non-empty sentence strings (fallback: if Segmenter unavailable, split on `/(?<=[.!?。])\s+/`).
**Step 4:** PASS. **Step 5:** commit `feat: sentence/token segmentation helpers`.

---

### Task 2: Alignment validator

**Files:** Create `server/services/align.js`, `server/services/__tests__/align.test.js`.

**Step 1 — failing test:**
```javascript
import { describe, it, expect } from 'vitest';
import { validateAlign } from '../align.js';
const src=['a','b'], tgt=['x','y'];
it('keeps valid pairs', () => {
  expect(validateAlign([{src:[0],tgt:[0]},{src:[1],tgt:[1]}], src, tgt))
    .toEqual([{src:[0],tgt:[0]},{src:[1],tgt:[1]}]);
});
it('drops out-of-range groups, returns [] not throw', () => {
  expect(validateAlign([{src:[5],tgt:[0]}], src, tgt)).toEqual([]);
});
it('returns [] for malformed input', () => {
  expect(validateAlign(null, src, tgt)).toEqual([]);
  expect(validateAlign('nope', src, tgt)).toEqual([]);
});
```
**Step 2:** FAIL. **Step 3 — implement:** `validateAlign(align, srcTokens, tgtTokens)` → if not array return `[]`; keep only groups where `src`/`tgt` are arrays of integers all within `[0,len)`; drop others. Never throw. **Step 4:** PASS. **Step 5:** commit `feat: alignment validator (graceful degradation)`.

---

### Task 3: TranslationDocument builder (pre-translation structure)

**Files:** Create `server/services/translationDocument.js` + test.

`buildSegments(blocks)` → for each block, split into sentences, assign ids `b{n}s{m}`, attach `srcTokens` (tokenize). Returns `{ blocks:[{id,type,sentences:[{id, source, srcTokens}]}] }` and a flat `segments` list (refs) for batching. `SCHEMA_VERSION=1` exported.

Test: a 2-paragraph input → 2 blocks, correct sentence ids, srcTokens populated. Commit `feat: TranslationDocument segment builder`.

---

### Task 4: LiteLLM batch translate+align adapter

**Files:** Modify `server/adapters/ai/LiteLLMProvider.js`; test `server/adapters/ai/__tests__/litellmBatch.test.js`.

Add `async translateBatchAligned(segments, from, to)` where `segments=[{id, source, srcTokens}]`. Build ONE chat call: system prompt instructs "translate he→{to}; return ONLY JSON array `[{id, target, align}]`; `align` = list of `{src:[srcTokenIdx],tgt:[tgtTokenIdx]}`; src indices refer to the provided 0-based token list." Provide each segment as `id` + indexed source tokens. `temperature:0`, JSON response.
Returns `{ items: [{id, target, align}], usage: {model, promptTokens, completionTokens, totalTokens, costUsd} }` — parse `data.usage`, actual model from `data.model`, cost from response header `x-litellm-response-cost` or `data._hidden_params?.response_cost` (default 0).
**Robustness:** parse JSON defensively; per-item validate (has id+target string); malformed/missing items → omitted (caller falls back to source). Malformed whole response → `{items:[], usage}`.

Test (mock global.fetch): returns array → parsed items + usage; one malformed item → skipped, others kept; non-JSON → `items:[]` no throw; assert request body model alias = 'translate'. Commit `feat: LiteLLM batch translate+align with usage capture`.

---

### Task 5: Usage aggregator

**Files:** Create `server/services/usage.js` + test.

`newUsage()` → empty; `addCall(usage, {model,promptTokens,completionTokens,totalTokens,costUsd})` accumulates into `byModel[model]` (`calls,in,out,total,costUsd`) and `totals`. `finalize(usage,{owner,jobId,ts})` stamps metadata. Test accumulation across 2 calls of same+different model. Commit `feat: per-job usage/cost aggregator`.

---

### Task 6: Wire pipeline in worker (chunked batch → TranslationDocument + usage + result store)

**Files:** Modify `server/api/translate.js` (queue processor); create `server/services/resultStore.js` + test.

- `resultStore`: `save(token, doc, ttlMs)` / `get(token)` using ioredis (key `result:<token>`, JSON, TTL); in-memory Map fallback if no redis. Test save/get/expire.
- Processor: extract (existing `documentProcessor.processDocument`) → `buildSegments` → chunk flat segments (≤18 segments OR ~1500 src tokens per chunk, respect order) → for each chunk `provider.translateBatchAligned` (bounded concurrency, reuse pattern) → map items back by id, `validateAlign`, tokenize target → fill sentences (`target`,`tgtTokens`,`align`); missing item → `target=source`, `align=[]` → accumulate usage.
- **Segment cap:** if total segments > `MAX_SEGMENTS` (env, default 1500) → truncate remainder to source-only and `log` a warning (no silent cap).
- Build final `TranslationDocument` (schemaVersion, langs, blocks, usage.finalize({owner:'anon',jobId})). `resultStore.save(token, doc)`. Also keep generating the downloadable file (existing path) for the Download button.
- `completed` socket event includes `resultToken` (the result store key) alongside `downloadUrl`.

No new unit test for the whole processor (needs redis/LLM); covered by integration + manual. Commit `feat: chunked batch pipeline -> TranslationDocument + usage + result store`.

---

### Task 7: `GET /api/result/:token` (hardened)

**Files:** Modify `server/api/translate.js`; test `server/api/__tests__/result.test.js` (supertest).

Validate `:token` against `/^[0-9a-fA-F-]{8,}$/` → 400 else; `resultStore.get` → 404 if missing; strip `usage` from payload; set `Cache-Control: private, no-store`; return `{schemaVersion,sourceLang,targetLang,blocks}`.
Tests: bad token → 400; missing → 404; present → 200 with blocks and **no `usage`**; header set. Commit `feat: hardened /api/result/:token (no usage leak, no-store)`.

---

### Task 8: `GET /api/admin/usage` (ADMIN_KEY gate)

**Files:** Modify `server/api/translate.js` (or new `server/api/admin.js` mounted in index.js); test.

Require header `x-admin-key === process.env.ADMIN_KEY` (and ADMIN_KEY set) → else 401/404. Return recent jobs' usage grouped by `owner` (read from a `usagelog` list in resultStore/redis, capped length). 
Tests: no/invalid key → 401; valid key → 200 with grouped usage. Commit `feat: admin usage endpoint (ADMIN_KEY gated, per-owner)`.

---

### Task 9 (frontend): fetch result + viewer state

**Files:** Modify `client/src/App.js`.

On `translation:complete`, store `resultToken`; fetch `GET ${API_URL}/api/result/<token>` → `translationDoc` state. Render `<SideBySideViewer doc={translationDoc}/>` when present (alongside existing download). Commit `feat(client): fetch TranslationDocument on completion`.

---

### Task 10 (frontend): SideBySideViewer (XSS-safe render)

**Files:** Create `client/src/components/SideBySideViewer.js` + `client/src/components/__tests__/SideBySideViewer.test.js` (RTL/jest via CRA).

Render two panes from `doc.blocks`. Left source `dir="rtl"` with `style={{unicodeBidi:'plaintext'}}` per sentence; right target LTR. Each token: `<span data-b data-s data-t onMouseEnter/onClick>{token}</span>` joined by spaces. **All text via React children (never `dangerouslySetInnerHTML`).**
Tests: renders block/sentence/token counts; **XSS fixture**: a token `"<img src=x onerror=alert(1)>"` appears as literal text (query by text), no HTML injected. Commit `feat(client): side-by-side viewer, XSS-safe`.

---

### Task 11 (frontend): synchronized highlighting

**Files:** Modify `SideBySideViewer.js` + test.

State `active={blockId,sentenceId,tokenIdx,side}`. Hover/click token → compute paired token indices via the sentence's `align` (both directions: clicking a src token → tgt tokens where group.src includes idx, and vice versa) → apply `.hl` class to matched spans on the other side; clicking sentence gap → highlight whole paired sentence; block → block. If `align` empty → fall back to sentence-level highlight.
Test: given a doc with `align:[{src:[0],tgt:[0]}]`, simulate hover on src token 0 → target token 0 gets highlight class; sentence click highlights all target tokens of paired sentence. Commit `feat(client): bidirectional block/sentence/word highlight`.

---

### Task 12 (frontend): admin usage panel

**Files:** Modify `client/src/App.js` / new `client/src/components/UsagePanel.js`.

If an admin key is present (e.g., `localStorage.adminKey` or `?adminKey=`), fetch `/api/result/<token>` admin variant or `/api/admin/usage` with `x-admin-key` and show `model · in/out tokens · $cost` for the current doc. Hidden for non-admin. Commit `feat(client): admin usage panel`.

---

### Task 13: iOS download fix

**Files:** Modify `client/src/App.js` (`handleDownload`) / `DocumentPreview.js`.

Replace blob+`a.download` with a direct anchor: `const a=document.createElement('a'); a.href=`${API_URL}${documentUrl}`; a.download=''; a.click();` (server sends `Content-Disposition: attachment`). Removes the iOS blob-inline behaviour. Commit `fix(client): direct attachment download (iOS Safari)`.

---

### Task 14: light UI refresh + tests/CI green

Tidy result screen layout around the viewer (MUI), responsive two-pane (stack on mobile). Run `npm test` (server) + client tests green. Commit `chore: UI polish + green tests`.

---

### Task 15: deploy + verify

Merge `feat/phase1-viewer` → `main` (PR); on sec: `git pull && docker compose -f docker-compose.prod.yml up -d --build app` (+ set `ADMIN_KEY`, `MAX_SEGMENTS` env). Verify on https://translator.creatman.site: upload the geotech PDF → viewer renders side-by-side; hover a word → pair highlights; sentence/block highlight; admin panel shows tokens/cost; download works on iOS. Log decision to memory.

---

## Acceptance criteria (design §7 🔴)
- [ ] Viewer renders only via React text nodes; XSS fixture inert (Task 10)
- [ ] `/api/result/:token` UUID-validated, TTL, `private,no-store`, usage stripped (Task 7)
- [ ] align strictly validated; invalid → sentence-level, no crash (Tasks 2,6,11)
- [ ] batch structured-output malformed → per-item fallback, job survives (Task 4,6)
- [ ] client renders server tokens as-is; NFC; RTL/bidi correct (Tasks 1,10)
- [ ] cache key carries schemaVersion; no Phase-0 collision (Task 4/6)
- [ ] segment cap with explicit log (Task 6)
- [ ] budget admin-gated (ADMIN_KEY); never in public payload (Tasks 7,8)
- [ ] few LLM calls per doc (chunked), not per-sentence (Task 6)
