# Hebrew Translator — Phase 0 Implementation Plan (vertical slice to prod)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a public, hardened he→en text-level translator at `translator.creatman.site` — the clean core wired into the request path, all 🔴 security/correctness defects fixed, deployed on sec+Coolify.

**Architecture:** Express API → Bull/Redis queue → worker → `core/translation` Translator (DI) → `OpenRouterProvider` (Claude). React client. Document path is text-level for Phase 0 (flat extract → paragraph blocks → translate → basic output); full fidelity comes in Phases 1-2.

**Tech Stack:** Node ≥18, Express, Bull, ioredis, Socket.IO, vitest, multer, pdf-parse, mammoth, docx, pdfkit, Docker, Coolify.

> **Sequencing note (needs operator OK):** The design lists LiteLLM in Phase 0. To reach prod fastest with zero new infra, Phase 0 ships with the existing `OpenRouterProvider` (model bumped to Claude Sonnet 4.x) wired through the same `AIProvider` interface. The LiteLLM proxy + multi-alias routing + free-MT + QA arrive in **Phase 3** as a drop-in `LiteLLMProvider` behind the identical interface. No rework — only an added adapter. If you want LiteLLM in Phase 0, insert Task 12b (stand up LiteLLM container + `LiteLLMProvider`) before deploy.

**Branch:** `feat/production-he-en` (already created; design doc committed at `e56c85b`).

**Test command:** `npm test -- <path>` (vitest). Run from repo root.

---

### Task 1: Repo hygiene — untrack runtime artifacts

**Files:**
- Modify: `.gitignore`
- Remove from tracking: `server/uploads/*.pdf`, `error.log`, `combined.log` (if present)

**Step 1:** Append to `.gitignore`:
```
# Runtime artifacts
server/uploads/*
!server/uploads/.gitkeep
*.log
logs/
.env
```

**Step 2:** Untrack already-committed artifacts:
```bash
git rm -r --cached server/uploads 2>/dev/null; git rm --cached error.log 2>/dev/null; true
mkdir -p server/uploads && touch server/uploads/.gitkeep
git add .gitignore server/uploads/.gitkeep
```

**Step 3:** Commit:
```bash
git commit -m "chore: untrack runtime uploads/logs, add gitignore rules"
```

---

### Task 2: Fail-fast config validation

**Files:**
- Create: `server/config/env.js`
- Create: `server/config/__tests__/env.test.js`
- Add dep: `envalid`

**Step 1: Write failing test** (`server/config/__tests__/env.test.js`):
```javascript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../env.js';

describe('loadConfig', () => {
  it('throws when OPENROUTER_API_KEY is missing in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/OPENROUTER_API_KEY/);
  });

  it('returns defaults in development', () => {
    const cfg = loadConfig({ NODE_ENV: 'development', OPENROUTER_API_KEY: 'sk-test' });
    expect(cfg.PORT).toBe(3001);
    expect(cfg.REDIS_HOST).toBe('localhost');
    expect(cfg.MAX_FILE_MB).toBe(25);
  });
});
```

**Step 2:** Run `npm test -- server/config` → FAIL (module not found).

**Step 3: Implement** (`server/config/env.js`) using a small explicit validator (no env mutation; pure function over an env object). Keys: `NODE_ENV`, `PORT`(3001), `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`, `OPENROUTER_API_KEY` (required in production), `TRANSLATE_MODEL` (default `anthropic/claude-sonnet-4`), `CORS_ORIGINS` (csv), `MAX_FILE_MB`(25), `MAX_PAGES`(50), `RATE_LIMIT_MAX`(30), `RATE_LIMIT_WINDOW_MS`(900000), `DOWNLOAD_TTL_MS`(900000). Throw aggregated error listing every missing/invalid key.

**Step 4:** Run `npm test -- server/config` → PASS.

**Step 5:** Commit `feat: fail-fast env config validation`.

---

### Task 3: Fix cache key to include model + prompt version 🔴

**Files:**
- Modify: `server/core/translation/Translator.js:14-37`
- Test: `server/core/translation/__tests__/translator.cachekey.test.js`

**Step 1: Failing test:**
```javascript
import { describe, it, expect } from 'vitest';
import Translator from '../Translator.js';

const stubCache = () => { const m = new Map(); return {
  async get(k){return m.has(k)?m.get(k):null;}, async set(k,v){m.set(k,v);},
  getStats(){return{};}, async clear(){m.clear();}, _m:m }; };

it('cache key changes with model', async () => {
  const cache = stubCache();
  const ai1 = { async translate(){return 'A';} };
  const ai2 = { async translate(){return 'B';} };
  const t1 = new Translator(ai1, cache, { model: 'm1' });
  const t2 = new Translator(ai2, cache, { model: 'm2' });
  const r1 = await t1.translateText('shalom', 'he', 'en');
  const r2 = await t2.translateText('shalom', 'he', 'en');
  expect(r1.text).toBe('A');
  expect(r2.text).toBe('B'); // different model => cache miss, not stale 'A'
});
```

**Step 2:** Run → FAIL (`r2.text` is `'A'`, stale).

**Step 3: Implement:** add `this.model = options.model || 'default'` and `this.promptVersion = options.promptVersion || 'v1'` in constructor; change `cacheKey` to hash `${text}|${from}|${to}|${this.model}|${this.promptVersion}` and prefix `tr:${this.model}:...`.

**Step 4:** Run → PASS.

**Step 5:** Commit `fix: include model+promptVersion in translation cache key`.

---

### Task 4: Bump model + wire core Translator into request path 🔴

**Files:**
- Modify: `server/core/translation/index.js:21` (default model → `anthropic/claude-sonnet-4`; pass `model` to Translator options)
- Rewrite: `server/api/translate.js` (use `createTranslator` + text-level doc path; drop legacy `services/Translator` import)
- Create: `server/services/textDocument.js` (flat-text extract + paragraph blocks + render)
- Test: `server/services/__tests__/textDocument.test.js`
- Delete: `server/services/Translator.js`, `server/services/ApiKeyManager.js`

**Step 1: Failing test for the text-doc helper:**
```javascript
import { describe, it, expect } from 'vitest';
import { toBlocks, renderText } from '../textDocument.js';

it('splits text into paragraph blocks and marks non-empty as translatable', () => {
  const blocks = toBlocks('שלום\n\nworld\n\n  ');
  expect(blocks).toHaveLength(2);
  expect(blocks[0]).toMatchObject({ type: 'text', content: 'שלום', needsTranslation: true });
});

it('renderText joins translated blocks', () => {
  expect(renderText([{content:'hello'},{content:'world'}])).toBe('hello\n\nworld');
});
```

**Step 2:** Run `npm test -- server/services` → FAIL.

**Step 3: Implement** `textDocument.js`: `toBlocks(str)` splits on blank lines, trims, drops empties, `{type:'text', content, sourceLang:'he', needsTranslation:true}`; `renderText(blocks)` joins `content` with `\n\n`.

**Step 4:** Run → PASS.

**Step 5: Rewire `api/translate.js`:** replace `new Translator()` (legacy) with `const { createTranslator } = require('../core/translation'); const translator = createTranslator({ model: config.TRANSLATE_MODEL });`. In the queue processor: `processDocument` → flat `content` → `toBlocks` → `translator.translateDocument(blocks, targetLang)` → `renderText` → `documentProcessor.generateTranslatedDocument(..., outputPath)`. Remove legacy imports.

**Step 6: Delete legacy files** and grep to confirm no references:
```bash
git rm server/services/Translator.js server/services/ApiKeyManager.js
```
Run `npm test` (full) → green; manual grep `openai` across `server/` → only in package.json (removed next task).

**Step 7:** Commit `feat: wire clean core Translator (Claude Sonnet 4.x) into request path; drop legacy OpenAI translator`.

---

### Task 5: Remove OpenAI dependency 🔴 (no-OpenAI principle)

**Files:**
- Modify: `package.json` (remove `openai`, `@google-cloud/translate` if unused)
- Verify: no `require('openai')` anywhere

**Steps:**
```bash
npm remove openai
grep -rn "openai" server/ client/src/ || echo "clean"
npm test
git add package.json package-lock.json && git commit -m "chore: remove openai dependency (no-OpenAI principle)"
```

---

### Task 6: Path-traversal fix on /download 🔴

**Files:**
- Modify: `server/api/translate.js` (download route)
- Test: `server/api/__tests__/download.test.js` (supertest)

**Step 1: Failing test:**
```javascript
import request from 'supertest';
// build a minimal express app mounting the router, then:
it('rejects path traversal', async () => {
  const res = await request(app).get('/api/download/..%2f..%2f.env');
  expect(res.status).toBe(400);
});
```

**Step 2:** Run → FAIL (404/file access instead of 400).

**Step 3: Implement:** in download handler, `const safe = path.basename(req.params.filename); if (!/^[\w.-]+$/.test(safe)) return res.status(400).json({success:false,message:'invalid filename'});` then join with `safe`.

**Step 4:** Run → PASS.

**Step 5:** Commit `fix: sanitize download filename (path traversal)`.

---

### Task 7: Stop static-serving uploads; token-gated download 🔴

**Files:**
- Modify: `server/index.js:60` (remove `app.use('/uploads', express.static(...))`)
- Modify: `server/api/translate.js` (return a random `downloadToken`; map token→file; download by token)

**Step 1: Failing test:** GET `/uploads/<any>.pdf` should 404 (not served).
```javascript
it('does not static-serve uploads', async () => {
  const res = await request(app).get('/uploads/whatever.pdf');
  expect(res.status).toBe(404);
});
```

**Step 2:** Run → FAIL (currently served).

**Step 3: Implement:** delete the static line. On job completion store `token = crypto.randomUUID()` → output path in Redis (TTL `DOWNLOAD_TTL_MS`); `complete` socket event sends `/api/download/<token>`; download route looks up token in Redis, streams file, then schedules delete.

**Step 4:** Run → PASS.

**Step 5:** Commit `fix: remove public static uploads; serve downloads via random token + TTL`.

---

### Task 8: Magic-byte file validation 🔴

**Files:**
- Modify: `server/api/translate.js` (post-upload validation) or `server/middleware/fileValidation.js`
- Add dep: `file-type`
- Test: `server/middleware/__tests__/fileValidation.test.js`

**Step 1: Failing test:** a `.docx`-named file whose bytes are plain text is rejected; a real PDF (`%PDF`) passes.

**Step 2:** Run → FAIL.

**Step 3: Implement:** after multer writes the file, read it and use `file-type` (or check `%PDF` magic for pdf and PK-zip + `[Content_Types].xml` for docx); reject mismatch with 400 + unlink. Keep extension+mimetype as a first cheap gate.

**Step 4:** Run → PASS.

**Step 5:** Commit `fix: validate uploads by magic bytes, not mimetype`.

---

### Task 9: DoS caps — size, pages, zip-bomb, job timeout 🔴

**Files:**
- Modify: `server/api/translate.js` (multer `limits.fileSize` from `config.MAX_FILE_MB`)
- Modify: `server/documentProcessor.js` (reject PDFs with > `MAX_PAGES`; for DOCX cap total uncompressed entry size)
- Modify: queue processor (per-job timeout)
- Test: `server/documentProcessor.__tests__/limits.test.js`

**Steps (TDD):** test that a fake DOCX (zip) whose declared uncompressed size exceeds cap throws `DOC_TOO_LARGE`; PDF with pages > cap throws `TOO_MANY_PAGES`. Implement guards reading zip central directory sizes (via `yauzl`/existing zip lib) and pdf page count before extraction. Bull job: `{ timeout: 120000, attempts: 1 }`. Commit `feat: enforce file size/page/zip-bomb caps + job timeout`.

---

### Task 10: Socket.IO per-session rooms (no broadcast leak) 🔴

**Files:**
- Modify: `server/index.js` (socket connection joins room by `socket.handshake.query.sessionId`)
- Modify: `server/api/translate.js` (accept `sessionId` from client; emit with `io.to(sessionId)` instead of `io.emit`)
- Modify: `client/src/App.js` (generate a sessionId, pass on socket connect + in form)
- Test: `server/__tests__/socket.rooms.test.js` (socket.io-client: client A must NOT receive client B's progress)

**Step 1: Failing test** with two socket clients in different rooms; emit progress for B's job; assert A receives nothing within 200ms.

**Step 2:** Run → FAIL (broadcast reaches A).

**Step 3: Implement** rooms + targeted emits.

**Step 4:** Run → PASS.

**Step 5:** Commit `fix: scope translation progress to per-session socket rooms`.

---

### Task 11: helmet, CORS from env, middleware order

**Files:**
- Modify: `server/index.js`

**Steps:** re-enable `app.use(helmet())`; CORS `origin` from `config.CORS_ORIGINS`; move `express.json()` / `urlencoded` before routers; keep multipart on the upload route. Add a basic test that `/api/health` returns security headers (`x-dns-prefetch-control`). Commit `fix: enable helmet, env-driven CORS, correct middleware order`.

---

### Task 12: Dockerize (multi-stage) + compose (app + redis)

**Files:**
- Rewrite: `Dockerfile` (stage 1 build `client` → static; stage 2 node runtime serving API + static)
- Rewrite: `docker-compose.yml` (services: `app`, `redis`)
- Modify: `server/index.js` (serve `client/build` static in production; SPA fallback)

**Steps:** build locally `docker compose build`; `docker compose up`; smoke `curl localhost:3001/api/health` → 200. Commit `build: multi-stage Docker image + compose (app+redis)`.

---

### Task 13: CI — GitHub Actions (lint + test)

**Files:**
- Create: `.github/workflows/ci.yml` (node 20, `npm ci`, `npm run lint`, `npm test`, with a redis service)

**Steps:** push branch, confirm Actions green. Commit `ci: lint + test on push/PR`.

---

### Task 14: Deploy to translator.creatman.site (sec + Coolify) — ops

**Not code — runbook (operator + Claude with SSH):**
1. DNS: add A record `translator.creatman.site` → `178.17.50.45`.
2. Coolify: new project from `github.com/CreatmanCEO/hebrew_doc_translator`, branch `main` (after merge), services: app (this Dockerfile) + redis. Set env (`OPENROUTER_API_KEY`, `TRANSLATE_MODEL`, `REDIS_*`, `CORS_ORIGINS=https://translator.creatman.site`, caps). Domain + auto-TLS.
3. Verify: `https://translator.creatman.site/api/health` 200; upload a Hebrew `.docx`, confirm he→en download; confirm `/uploads/x` 404; confirm rate limit triggers.
4. Enable Coolify auto-deploy on push to `main`.

---

### Task 15: Docs — CHANGELOG + README

**Files:** Create `CHANGELOG.md` (Keep-a-Changelog, `0.1.0 — Phase 0 prod he→en`); update `README.md` (real stack, run, env, deploy). Update `PROJECT.md` status to match reality. Commit `docs: changelog + accurate README for Phase 0`.

---

### Finish Phase 0

- Open PR `feat/production-he-en` → `main`; REQUIRED SUB-SKILL: superpowers:requesting-code-review.
- After merge + green deploy: log decision to MNEMO (`mnemo_write`, type=decision, "Phase 0 he→en live at translator.creatman.site").
- Then plan Phase 1 (DOCX full-fidelity).

## Acceptance criteria (Phase 0 = §8 🔴 baseline)
- [ ] he→en works end-to-end on `.docx` and digital `.pdf` (text level) in prod
- [ ] No OpenAI dependency anywhere
- [ ] Cache key includes model+promptVersion
- [ ] No socket broadcast leak (rooms test passes)
- [ ] Download path-traversal rejected; uploads not static-served; token+TTL downloads
- [ ] Magic-byte validation; file size/page/zip-bomb caps; job timeout
- [ ] helmet on, CORS from env
- [ ] CI green; deployed via Coolify with auto-TLS; `/api/health` 200
