# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/), versioning is [SemVer](https://semver.org/).

## [Unreleased]

### Phase 1+ (planned)
- DOCX full-fidelity in-place XML translation
- PDF positional overlay (pdf.js + pdf-lib + fontkit, RTL/bidi)
- Full LiteLLM orchestration: free-MT fallback, QA pass, multi-provider fallback chains
- Scanned-document OCR branch

## [0.1.0] — Phase 0: production vertical slice (he→en)

First production-ready cut: a hardened, public text-level translator deployed at
`translator.creatman.site`.

### Added
- Clean dependency-injected translation core (`server/core/translation`) wired into the request path.
- `LiteLLMProvider` adapter + LiteLLM proxy config (`translate` alias → Claude Sonnet 4.x via OpenRouter, Gemini fallback).
- Fail-fast environment validation (`server/config/env.js`).
- Magic-byte upload validation (PDF/DOCX), independent of declared MIME/extension.
- DoS caps: file-size limit, PDF page cap, DOCX zip-bomb guard (`yauzl`), Bull job timeout.
- Per-session Socket.IO rooms for progress events.
- Token-named, TTL-cleaned downloads.
- Multi-stage Dockerfile + `docker-compose` (app + redis + litellm); CI (lint + server tests + client build).

### Changed
- Server test harness runs on Windows (`vitest.config.server.js` + `cross-env`).
- `helmet` re-enabled; CORS and rate limits driven by environment.
- `documentProcessor` reduced to the flat-text path; orphaned layout code removed.

### Removed
- **OpenAI** dependency and all OpenAI-based code (principled: no OpenAI).
- Public static serving of `/uploads` (cross-user document leak).
- Committed test PDFs and runtime artifacts.

### Fixed
- Translation cache key now includes model + prompt version (no stale cross-model hits).
- Path traversal on the download route.
- `generatePDF` used `fs.promises.createWriteStream` (does not exist) — now uses sync `fs`.
