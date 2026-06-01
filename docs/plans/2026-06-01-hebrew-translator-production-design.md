# Hebrew Document Translator → Production (he→en) — Design

**Date:** 2026-06-01
**Author:** Claude Code (Opus 4.8) + operator (Nick)
**Status:** Approved (design-lock)
**Target:** Public production service at `translator.creatman.site`, he→en first.

---

## 0. Context: ground truth vs aspirational docs

The repo's `PROJECT.md` / job-card describe a polished Python OCR pipeline. Reality (verified by reading the code):

- Stack is **Node.js/Express + React (CRA)**, not Python/Tesseract.
- A clean **adapter-based "new architecture"** exists (`server/core/translation/`, `server/adapters/`) but is **orphaned** — the request path (`index.js` → `api/translate.js`) still imports the **legacy** `services/Translator` + `documentProcessor` (OpenAI-based, violates the no-OpenAI principle).
- "Full-fidelity reconstruction" is claimed but the wired path does `pdf-parse`/`mammoth.extractRawText` → **flat text**, then regenerates a basic PDFKit/DOCX. The richer `formatPdfContent`/`detectTables` methods exist but are never called.
- `.env` contains only placeholders — **no leaked secrets**.

This design closes the gap between ambition and reality, incrementally.

## 1. Decisions (locked)

| Topic | Decision |
|-------|----------|
| Fidelity | Full layout (pixel-faithful goal), shipped incrementally |
| Inputs | Both digital (phase 1) and scanned/OCR (phase 4) |
| Deploy | sec VPS (178.17.50.45) + Coolify, subdomain `translator.creatman.site` |
| rotator | Memory/context — recall + log decisions (ADR 2026-05-20). Not an executor. |
| AI layer | **LiteLLM** orchestration, 3-tier + QA + free-MT fallback; providers OpenRouter / Cerebras / Groq / Google AI Studio (free). **NO OpenAI.** |
| Access | Public + hard rate limits |
| Reconstruction | **DOCX in-place XML** + **PDF positional overlay** |

## 2. Target architecture

```
[React client] ──► [Express API] ──► [Bull queue / Redis] ──► worker
                        │                                        │
                        ▼                                        ▼
                 [Socket.IO progress (per-session room)]   [TranslationRouter]
                                                          │   │   │
                                              ┌───────────┘   │   └────────────┐
                                              ▼               ▼                ▼
                                       [LiteLLM proxy]  [Free MT adapters]  [QA pass]
                                       (OpenRouter/Groq/   (Lingva/Libre/    (2nd model
                                        Cerebras/Gemini)    MyMemory)         as scorer)
```

- The orphaned `core/translation/Translator` (DI) becomes the **single** translation core. Legacy `services/Translator` + OpenAI path **deleted**.
- AI layer = **LiteLLM proxy container** (OpenAI-compatible endpoint) + Node adapters. Free MT-API adapters sit behind the same provider interface.

## 3. AI orchestration (LiteLLM)

LiteLLM config with task aliases + fallback chains for free-tier rate limits:

| Alias | Task | Model / provider (priority → fallback) |
|-------|------|----------------------------------------|
| `detect` | language of block | Gemini Flash (free) → Groq Llama → Unicode heuristic |
| `mt-fast` | cheap first pass / simple blocks / budget fallback | Lingva / LibreTranslate / MyMemory |
| `translate` | quality he→en | Claude Sonnet 4.x (OpenRouter) → Gemini Pro |
| `qa` | term/consistency check (scorer, not rewriter) | second model cross-checks first's output |

Prompt caching of system prompt where supported. Free MT is **fallback for quality/budget**, not the default first pass (free MT he→en quality is materially weaker than Claude). Free Google AI Studio is **train-on-data** → never route confidential user content through it (see §8.4).

## 4. Document pipeline (DOCX-XML + PDF-overlay)

- **Input router:** by extension + "has text layer?" detection (digital vs scan).
- **DOCX (highest fidelity):** unzip → parse `document.xml` → translate text inside `w:t` runs **in place**, preserving run boundaries/styles/`xml:space` → repackage. Layout preserved near-perfectly.
- **PDF (digital):** `pdf.js` extracts text + bbox + font → group into lines/blocks → translate → output via `pdf-lib`: copy original page (images/vector untouched), white-out original text, place translation in same bbox with fit-to-size; embed font (Noto) via fontkit for retained Hebrew/mixed.
- **Scan (Phase 4):** no text layer → OCR (vision model Gemini/Claude or tesseract) → coords → same overlay.
- **Progress:** Bull/Redis + Socket.IO (per-session rooms), temp-file auto-clean.

## 5. Production hardening (currently broken/risky)

- Re-enable `helmet`; CORS origins from env (not localhost hardcode).
- Fix middleware order (`express.json` etc.).
- Remove committed `server/uploads/*.pdf`, `error.log`; add to `.gitignore`.
- `.env` → `.env.example` placeholders only; real secrets only in Coolify env.
- Limits: file size, page count, per-IP rate limit; zip-bomb guard for DOCX.
- winston logging without leaking document content.

## 6. Deploy (sec + Coolify)

- Multi-stage Dockerfile: build React → static served by Express. Coolify services: **app (Node)** + **redis** + **litellm**.
- DNS: A record `translator.creatman.site` → 178.17.50.45; auto-TLS via Traefik/Caddy in Coolify.
- CI: GitHub Actions (lint + test on push) → Coolify auto-deploy on push to `main`. Push after each commit; document changes in CHANGELOG.

## 7. Testing

- **Vitest unit:** core Translator + adapters (mock providers; `TranslatorMock` reused).
- **Integration:** DOCX round-trip (structure preserved); PDF overlay.
- **E2E:** Playwright upload → download.
- **Golden fixtures:** Hebrew samples (existing sample PDFs).

## 8. Best practices & guardrails (from design-guardrails-audit)

Every 🔴 below is an existing defect or hard requirement → **Phase-0 acceptance criteria**. 🟡 important, 🟢 desirable.

### 8.1 LLM correctness / hallucination
- 🔴 **Output contract:** wrap input in sentinels; detect refusals/added commentary; length-ratio guardrail (<30% / >300% / empty → retry → free-MT fallback).
- 🔴 **Mask non-translatables** (numbers, dates, currency, email, URL, proper nouns) with tokens before translation, restore after. Critical for invoices/forms.
- 🟡 **Glossary** for term consistency across blocks (accumulated per document, fed to prompt + cache).
- 🟡 **QA = scorer, not rewriter** (returns verdict+score; targeted block retry on issue).
- 🟢 `temperature=0` (currently 0.3 in `OpenRouterProvider.js:73`) for determinism + cache.

### 8.2 Concurrency / race conditions
- 🔴 **Socket.IO broadcast leak** — `api/translate.js:27,38` use `io.emit` (all clients see others' jobIds/downloadUrls). → per-session rooms (`io.to(room)`).
- 🔴 **Cache key missing model** — `core/translation/Translator.js:30` hashes only `text|from|to`. → add `model` + `promptVersion`.
- 🟡 **Cache stampede:** in-flight dedup (`Map<key, Promise>`).
- 🟡 **`franc` lazy-init race** — `documentProcessor.js:34` `while(!franc) sleep`. → awaited singleton promise.
- 🟡 Idempotent Bull jobs + per-job temp dir; uuid filenames; timeouts + backoff + `Retry-After`.

### 8.3 Resource exhaustion / DoS
- 🔴 **Zip-bomb / decompression bomb** in DOCX (zip). → cap decompressed size, page count, job timeout, memory.
- 🔴 **Magic-byte validation** — `api/translate.js:122` trusts `file.mimetype` (spoofable).
- 🟡 Backpressure (429 when queue full); per-IP daily quota over rate-limit.
- 🟡 Temp-file janitor (cron) — delete after download + by TTL (prior disk-fill incident on scanner VPS).

### 8.4 Security & data privacy
- 🔴 **Path traversal** — `api/translate.js:208-216` joins `uploads` + unsanitized `:filename`. → `path.basename` + allowlist.
- 🔴 **`/uploads` served static** — `index.js:60` exposes all uploaded + translated docs by guessable URL (cross-user data leak). → not static; download only via authorized route + random token.
- 🔴 **No-train providers for user content.** Free Google AI Studio free-tier trains on data. → route confidential content only through no-train providers (OpenRouter headers); free-MT/Google free for non-confidential/fallback only; state in privacy policy.
- 🟡 No content logging; CSP; CORS allowlist; `npm audit` + Dependabot (`multer@1.x`, `docx4js`, `pdf-parse` are stale).

### 8.5 Output / domain correctness
- 🟡 **Bidi + shaping** for retained Hebrew/mixed: `pdf-lib` + `fontkit` + bidi lib, embed Noto Sans Hebrew (OFL). he→en output is mostly LTR — lower risk in v1, but mixed names/numbers remain.
- 🟡 **Overflow** when translated length ≠ original: auto-fit (shrink kegl / wrap) policy.
- 🟡 **DOCX in-place:** operate on XML nodes (not string-replace); `xml:space="preserve"`; runs split mid-word; Unicode NFC.

### 8.6 Observability & cost
- 🟡 Correlation id = jobId in all logs (content redacted); health endpoint checks Redis + LiteLLM + providers.
- 🟡 **Cost guardrails:** per-job token budget, monthly cap + alert, $/provider metrics, cache-hit rate, queue depth.

### 8.7 Quality as process
- 🟡 **Golden eval set** he→en with reference translations + auto-scoring (chrF/COMET or LLM-judge), gated in CI — the reliable way to manage quality/hallucination across model/provider swaps.
- 🟡 Contract tests per provider adapter via `msw` (recorded responses); TDD on core.
- 🟢 Fail-fast env validation at boot (zod/envalid).

## 9. Delivery phases

- **Phase 0 — vertical slice to prod + security baseline:** repo cleanup, delete OpenAI, wire core Translator + LiteLLM (Claude via OpenRouter), basic he→en (text level), all §8 🔴 fixed, **deploy to translator.creatman.site public + limits.** → live in prod.
- **Phase 1 — DOCX full-fidelity** (in-place XML) + §8.1 masking/guardrails/glossary.
- **Phase 2 — PDF digital overlay** (pdf.js + pdf-lib + fontkit).
- **Phase 3 — full LiteLLM orchestration** (free-MT + QA pass + fallback chains).
- **Phase 4 — scans / OCR.**
- **Phase 5 — polish:** abuse protection, observability, cost guardrails, portfolio README.

Cross-cutting from Phase 0: eval set, cost guardrails, observability.
