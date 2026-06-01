# Hebrew Document Translator

Web service that translates Hebrew documents (PDF / DOCX) to English, preserving
document structure. Built around a clean translation core with pluggable AI
providers routed through a LiteLLM proxy (Claude via OpenRouter, Gemini fallback).

> **Status — Phase 0 (v0.1.0):** public text-level he→en translation, hardened and
> deployable. Full layout-fidelity reconstruction (DOCX in-place XML, PDF overlay)
> and scanned-document OCR are on the roadmap — see [CHANGELOG](./CHANGELOG.md) and
> `docs/plans/2026-06-01-hebrew-translator-production-design.md`.

## Features

- Upload PDF or DOCX, get a translated document back.
- Hebrew→English (he→ru/he→ar also supported by the core).
- Async processing with live progress over WebSocket (per-session, isolated).
- Translation caching (model- and prompt-version aware).
- Security baseline: magic-byte validation, size/page/zip-bomb caps, token-named
  TTL downloads, helmet, env-driven CORS + rate limiting.

## Stack

- **Backend:** Node.js ≥18, Express, Bull + Redis (queue), Socket.IO.
- **AI:** LiteLLM proxy → Claude Sonnet 4.x (OpenRouter) with Gemini fallback. **No OpenAI.**
- **Docs:** `pdf-parse` / `mammoth` (extract), `pdfkit` / `docx` (generate).
- **Frontend:** React (CRA), MUI.
- **Tests:** vitest (server), Playwright (e2e).

## Architecture

```
React client ──► Express API ──► Bull/Redis queue ──► worker
                     │                                   │
              Socket.IO (rooms)                  core Translator (DI)
                                                        │
                                                 LiteLLMProvider ──► LiteLLM proxy
                                                                      ├─ OpenRouter (Claude)
                                                                      └─ Gemini (fallback)
```

## Run (development)

```bash
# 1. install (peer-dep workaround required)
npm install --legacy-peer-deps
cd client && npm install && cd ..

# 2. configure
cp .env.example .env   # fill in keys (see Environment)

# 3. start Redis + LiteLLM (Docker) and the app
docker compose up redis litellm -d
npm run dev          # API on :3001
npm run client       # client on :3000  (or: npm run dev:full)
```

Run server tests: `npm test`.

## Environment

See `.env.example`. Key variables:

| Var | Purpose |
|-----|---------|
| `OPENROUTER_API_KEY` | Claude via OpenRouter (required in production) |
| `GEMINI_API_KEY` | Gemini fallback / detect |
| `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY` | LiteLLM proxy |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | queue / cache |
| `CORS_ORIGINS` | comma-separated allowed origins |
| `MAX_FILE_MB`, `MAX_PAGES`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `DOWNLOAD_TTL_MS` | limits |

## Deploy

Docker (`docker compose up --build`) or Coolify on the `sec` VPS at
`translator.creatman.site` (services: app + redis + litellm, auto-TLS). CI builds
and tests on push; Coolify auto-deploys `main`.

## License

MIT — see [LICENSE](./LICENSE).
