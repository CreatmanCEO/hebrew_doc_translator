# ARCHITECTURE.md — Целевая архитектура (Phase 0 design)

> Статус: **draft, требует ревью**. Этот документ описывает целевое состояние после частичной переписки. Текущий код в `main` не соответствует этому плану — см. `MIGRATION_PLAN.md`.

Аудит вынес вердикт **B (частичная переписка)**: фронтенд-скелет, Express, Bull, multer и socket.io остаются; ядро обработки документа и LLM-слой переписываются. Иврит — единственный язык в MVP, но архитектура с первого дня **language-agnostic**: добавление арабского, фарси, идиша или урду — это новый файл-плагин, без изменений в ядре.

---

## 1. Системный обзор

```
                  ┌──────────────────┐
   Browser (Vite) │  Upload + WS UI  │
                  └────────┬─────────┘
                           │ multipart, jobId, socket.io
                           ▼
                  ┌──────────────────┐
                  │ Express API      │   /api/translate, /api/status, /api/download
                  │  (multer, zod)   │
                  └────────┬─────────┘
                           │ enqueue Job{filePath, srcLang, tgtLang}
                           ▼
                  ┌──────────────────┐
                  │ Bull Queue       │ ◄──► Redis (jobs + cache)
                  └────────┬─────────┘
                           │ worker
                           ▼
   ┌────────────────────── PIPELINE ──────────────────────┐
   │                                                      │
   │  DocumentAnalyzer  → структура, страницы, raw boxes  │
   │         │                                            │
   │         ▼                                            │
   │  TextExtractor     → text + image blocks             │
   │   ├─ embedded text path (pdfjs-dist / mammoth)       │
   │   └─ OCR path: OcrChain                              │
   │        ├─ TesseractProvider (local, free)            │
   │        └─ Cloud fallback (Google Vision | Azure)     │
   │         │                                            │
   │         ▼                                            │
   │  LanguageDetector (franc + LanguageModule.detector)  │
   │         │                                            │
   │         ▼                                            │
   │  Translator       → LlmProvider.translate(...)       │
   │   ├─ skip non-source-lang blocks                     │
   │   ├─ skip dates/urls/emails/numbers (regex pre-pass) │
   │   └─ Redis cache by sha1(text+srcLang+tgtLang+model) │
   │         │                                            │
   │         ▼                                            │
   │  DocumentGenerator → PDF (Puppeteer) | DOCX (docx)   │
   │   uses block.position + block.style + LangModule     │
   │                                                      │
   └──────────────────────────┬───────────────────────────┘
                              │ writes /uploads/translated_*.{pdf,docx}
                              ▼
                       socket.io progress
                       → client downloads via /api/download
```

**Границы очереди.** API-роут только валидирует и кладёт задачу в Bull; вся тяжёлая работа — в worker-процессе (`server/worker.js`). Worker импортируется из того же кода, но запускается отдельной командой (`npm run worker`) и в Docker — отдельным сервисом. Это позволяет масштабировать workers независимо и не убивать API при OOM в OCR.

---

## 2. Базовые интерфейсы

Все интерфейсы — JSDoc + TypeScript-сигнатуры в комментариях. Реальные файлы — обычный JS (CommonJS), но контракты строго следуем.

### 2.1 `DocumentBlock`

Единица, проходящая через пайплайн. Уточнение версии из PVD.

```ts
type BlockId = string;            // uuid v4
type ContentType = 'text' | 'image';
type LangCode = string;           // ISO 639-1 ('he', 'ar', 'fa', 'yi', 'ur', 'en', 'ru', 'unknown')

interface Position {
  page: number;       // 1-based; для DOCX всегда 1
  x: number;          // PDF-точки (1pt = 1/72 inch); для DOCX — twips делёные на 20
  y: number;          // от верхнего-левого угла страницы
  width: number;
  height: number;
}

interface Style {
  font?: string;            // имя шрифта из оригинала; маппится через LanguageModule.fontFamily
  size?: number;            // pt
  color?: string;           // '#RRGGBB'
  alignment?: 'left' | 'right' | 'center' | 'justify';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  direction?: 'ltr' | 'rtl';   // вычисляется LanguageModule.direction
}

interface DocumentBlock {
  id: BlockId;
  contentType: ContentType;
  position: Position;
  style: Style;

  // text-only
  text?: string;              // оригинал; после Translator — переведённый
  originalText?: string;      // сохраняется для логов и кеша
  language?: LangCode;        // определённый язык
  needsTranslation?: boolean; // true если language === sourceLang
  ocrConfidence?: number;     // 0..1; null если текст embedded

  // image-only
  imageData?: Buffer;         // raw bytes; в очередь передаётся как path, не Buffer
  imagePath?: string;         // tmp path; используется в очереди
  imageFormat?: 'png' | 'jpeg';
}
```

Жёсткие правила: `position` и `style` обязательны всегда. `text` может быть пустой строкой, но поле должно существовать у `contentType === 'text'`. После Translator поле `text` перезаписывается переводом, `originalText` остаётся неизменным.

### 2.2 `LanguageModule`

```ts
interface LanguageModule {
  code: LangCode;                  // 'he'
  direction: 'ltr' | 'rtl';        // 'rtl'
  shapingRequired: boolean;        // true для арабского/фарси/урду; false для иврита
  ocrLangPack: string;             // 'heb' для tesseract; 'iw' для Google Vision
  cloudVisionHint: string;         // languageHints для Google Vision API
  fontFamily: {
    regular: string;               // путь к ttf или имя в Puppeteer-CSS
    bold?: string;
    italic?: string;
  };
  // Доп-проверка после franc; pattern-based (regex по unicode-блокам)
  detector: (text: string) => boolean;
  // Опционально: транслитерация для отладки/логов
  transliterator?: (text: string) => string;
  // Опционально: pre-translate sanitize (убрать кантилляцию, никудот)
  preprocess?: (text: string) => string;
}
```

MVP-реализация: `server/languages/HebrewModule.js`. Заготовки имён следующих модулей: `ArabicModule`, `PersianModule`, `YiddishModule`, `UrduModule` — НЕ создаём в Phase 0, только описываем формат.

### 2.3 `OcrProvider`

```ts
interface OcrBox {
  text: string;
  confidence: number;     // 0..1
  bbox: { x: number; y: number; width: number; height: number };
}

interface OcrResult {
  text: string;             // конкатенация всех боксов в reading-order
  confidence: number;       // средневзвешенная (по площади бокса)
  boxes: OcrBox[];          // для последующей разбивки на DocumentBlock
  provider: string;         // 'tesseract' | 'google-vision' | 'azure-vision'
}

interface OcrProvider {
  name: string;
  recognize(image: Buffer, langCode: LangCode): Promise<OcrResult>;
  // health-check, чтобы fallback-цепочка могла skip-нуть мёртвого провайдера
  isAvailable(): Promise<boolean>;
}
```

### 2.4 `LlmProvider`

```ts
interface TranslateRequest {
  text: string;
  sourceLang: LangCode;
  targetLang: LangCode;
  // Контекст для смешанных документов: соседние блоки (для согласованности терминов)
  context?: { before?: string; after?: string };
  // Жёсткая инструкция: не переводить, если текст не на sourceLang
  preserveIfNotSource?: boolean;
}

interface TranslateResult {
  text: string;
  model: string;            // 'claude-sonnet-4-7', 'deepseek-chat', etc.
  tokensIn: number;
  tokensOut: number;
}

interface LlmProvider {
  name: string;
  translate(req: TranslateRequest): Promise<TranslateResult>;
  // Батч — обязателен для производительности (документ 50 блоков → 1 запрос)
  translateBatch(reqs: TranslateRequest[]): Promise<TranslateResult[]>;
  isAvailable(): Promise<boolean>;
}
```

### 2.5 Классы пайплайна

```ts
class DocumentAnalyzer {
  // Возвращает структуру: страницы, размеры, raw-элементы (pdfjs-dist для PDF, mammoth для DOCX)
  analyze(buffer: Buffer, mime: string): Promise<{ layout: LayoutInfo; raw: RawElement[] }>;
}

class TextExtractor {
  constructor(ocrChain: OcrProvider[], languageRegistry: LanguageRegistry);
  // Превращает raw-элементы в DocumentBlock[]; решает, нужен ли OCR
  extract(layout: LayoutInfo, raw: RawElement[], srcLang: LangCode): Promise<DocumentBlock[]>;
}

class Translator {
  constructor(llm: LlmProvider, redis: Redis, languageRegistry: LanguageRegistry);
  // Идемпотентно: если блок уже на targetLang или contentType==='image' — пропуск
  translate(blocks: DocumentBlock[], srcLang: LangCode, tgtLang: LangCode):
    Promise<{ blocks: DocumentBlock[]; failures: BlockId[] }>;
}

class DocumentGenerator {
  constructor(languageRegistry: LanguageRegistry);
  generatePdf(blocks: DocumentBlock[], layout: LayoutInfo): Promise<Buffer>;   // Puppeteer
  generateDocx(blocks: DocumentBlock[], layout: LayoutInfo): Promise<Buffer>;  // docx lib
}
```

---

## 3. Provider registry

Один общий паттерн — отдельные реестры для языков, OCR, LLM.

```js
// server/registry/LanguageRegistry.js
class LanguageRegistry {
  constructor() { this.modules = new Map(); }
  register(mod /* LanguageModule */) { this.modules.set(mod.code, mod); }
  get(code) { return this.modules.get(code); }
  detect(text) {
    // 1) franc → primary candidate
    // 2) среди зарегистрированных модулей вызвать .detector(text) для подтверждения
    // 3) fallback: 'unknown'
  }
}
```

`OcrChain` — упорядоченный список провайдеров с правилом fallback:

```js
class OcrChain {
  constructor(providers /* OcrProvider[] */, minConfidence = 0.6) {
    this.providers = providers; this.threshold = minConfidence;
  }
  async recognize(image, langCode) {
    let last;
    for (const p of this.providers) {
      if (!(await p.isAvailable())) continue;
      try {
        const r = await p.recognize(image, langCode);
        if (r.confidence >= this.threshold) return r;
        last = r;                          // запомним и попробуем следующий
      } catch (e) { /* лог + next */ }
    }
    if (last) return last;                  // лучше плохой результат, чем ничего
    throw new Error('OCR_CHAIN_EXHAUSTED');
  }
}
```

Сборка реестров — в `server/bootstrap.js`, читая env. Тесты подсовывают моки в реестр напрямую, не патча модули.

---

## 4. Технологические решения

### 4.1 LLM-провайдер — **OpenRouter** (рекомендация), Anthropic Claude как fallback

Выбран OpenRouter: один API, маршрутизация на Claude / DeepSeek / Gemini, единый биллинг, можно экспериментировать с моделями без переписывания кода. Для перевода связного текста на иврите целевая модель — `anthropic/claude-sonnet-4` (лучшее качество на семитских языках по бенчмаркам, поддерживает batch). DeepSeek (`deepseek/deepseek-chat`) — дешёвая альтернатива для черновых переводов и тестов. **Отвергнуто**: OpenAI (политика пользователя), прямой Gemini как primary (хуже на иврите по нашим тестам у других проектов). Архитектурно `LlmProvider` остаётся абстракцией — можно подменить на прямой Anthropic SDK без изменений в Translator. Открытый вопрос — наличие у пользователя OpenRouter-ключа (см. MIGRATION_PLAN, Open questions).

### 4.2 PDF generation — **Puppeteer (HTML→PDF)**

`pdfkit` — слабое RTL и нет shaping для арабского/фарси (что критично для будущих языков). `pdf-lib + harfbuzzjs` — даёт точность, но требует ручного позиционирования каждого глифа и собственного layout-engine; это месяцы работы. **Puppeteer** генерирует HTML с CSS `direction: rtl`, `unicode-bidi: plaintext`, `font-family` из LanguageModule, и Chrome нативно делает RTL/shaping/kerning. Координаты блоков задаются через `position: absolute; left/top/width/height` в pt — Chrome сохраняет их при печати в PDF. Минус: тяжелый рантайм (Chromium ~300MB), но в Docker это решается заранее. **Отвергнуто**: pdfkit (RTL слабый), pdf-lib+harfbuzz (слишком низкоуровневый для соло-разработчика).

### 4.3 PDF parsing — **pdfjs-dist** (прямой импорт)

`pdf-parse` — даёт только plain text без позиций. `pdf2json` — ставится отдельным CLI и medlennый. **pdfjs-dist** — официальная библиотека Mozilla, даёт `getTextContent()` с координатами каждого `TextItem` (transform-матрица → x/y/scale), плюс `getOperatorList()` для извлечения изображений. Уже используется через `pdf.js-extract`, но переходим на прямой API для контроля. **Отвергнуто**: pdf2json (deprecated практически), PDFium binding (нативный, проблемы с Windows-сборкой).

### 4.4 OCR cloud fallback — **configurable, оба поддерживаются**

Реализуем `GoogleVisionProvider` и `AzureVisionProvider`, оба за интерфейсом `OcrProvider`. Выбор — env-переменная `OCR_CLOUD_PROVIDER=google|azure|none`. Default-recommendation: **Google Vision** — лучше для иврита и арабского по published-бенчмаркам, проще auth (один JSON-ключ). Azure — резерв, если у пользователя уже Azure-эккаунт.

### 4.5 Frontend build — **Vite + React 18** (Phase 2)

CRA deprecated с 2024. Vite даёт HMR за миллисекунды, ESM-only сборку, нативный TS. Миграция — Phase 2 (после стабилизации backend). В Phase 1 фронтенд остаётся CRA — фокус на бэкенд.

---

## 5. Конфигурация

Все env читаются и валидируются в `server/config/env.js` через **zod**. Сервер падает на старте, если обязательные переменные отсутствуют (fail-fast).

```js
// server/config/env.js
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Redis — ОБЯЗАТЕЛЕН
  REDIS_URL: z.string().url(),               // redis://host:6379
  REDIS_TLS: z.coerce.boolean().default(false),

  // LLM
  LLM_PROVIDER: z.enum(['openrouter', 'anthropic', 'deepseek', 'gemini']).default('openrouter'),
  LLM_MODEL: z.string().default('anthropic/claude-sonnet-4'),
  OPENROUTER_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // OCR
  OCR_CLOUD_PROVIDER: z.enum(['google', 'azure', 'none']).default('none'),
  OCR_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  GOOGLE_VISION_KEY_JSON: z.string().optional(),     // путь к JSON service-account
  AZURE_VISION_ENDPOINT: z.string().url().optional(),
  AZURE_VISION_KEY: z.string().optional(),

  // Лимиты
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  QUEUE_CONCURRENCY: z.coerce.number().default(5),
}).superRefine((cfg, ctx) => {
  // Cross-field: если LLM_PROVIDER требует ключ — проверить
  const need = {
    openrouter: 'OPENROUTER_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    gemini: 'GEMINI_API_KEY',
  }[cfg.LLM_PROVIDER];
  if (!cfg[need]) ctx.addIssue({ code: 'custom', message: `${need} required for LLM_PROVIDER=${cfg.LLM_PROVIDER}` });
  if (cfg.OCR_CLOUD_PROVIDER === 'google' && !cfg.GOOGLE_VISION_KEY_JSON)
    ctx.addIssue({ code: 'custom', message: 'GOOGLE_VISION_KEY_JSON required' });
  if (cfg.OCR_CLOUD_PROVIDER === 'azure' && !(cfg.AZURE_VISION_ENDPOINT && cfg.AZURE_VISION_KEY))
    ctx.addIssue({ code: 'custom', message: 'AZURE_VISION_* required' });
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid configuration:', result.error.format());
  process.exit(1);
}
module.exports = result.data;
```

**Fail-fast Redis**: в `server/queue.js` при старте делаем `await redis.ping()` с таймаутом 5 сек. Не отвечает — `process.exit(1)`. Импорты роутов **не должны** создавать Bull-инстансы как side effect — фабрика `getQueue()` вызывается только в worker bootstrap.

---

## 6. Обработка ошибок

**OCR fallback** описан в §3 (`OcrChain`). Если последний провайдер вернул confidence ниже threshold — результат всё равно используется, но блок помечается флагом `lowConfidence: true`, и в финальном статусе пользователю отдаётся warning (не error).

**LLM rate-limits / errors**:
- 429 / 5xx → exponential backoff (3 попытки: 1s, 4s, 16s).
- После исчерпания — блок помечается `translationFailed: true`, его `text` **остаётся оригинальным**, и id попадает в `failures: BlockId[]` результата.
- Если `failures.length / blocks.length > 0.2` (>20% документа) — задача завершается со статусом `failed`, файл не отдаётся.
- Иначе — статус `completed_with_warnings`, файл отдаётся, но в socket-событии `translation:complete` приходит `warnings: [{ blockId, reason }]`.

**Socket.IO события**:
```
translation:progress { jobId, progress: 0..100, stage: 'analyze'|'extract'|'translate'|'generate' }
translation:complete { jobId, downloadUrl, warnings?: Warning[] }
translation:error    { jobId, code: string, message: string }
```

`code` — машиночитаемый: `OCR_CHAIN_EXHAUSTED`, `LLM_PROVIDER_DOWN`, `INVALID_PDF`, `FILE_TOO_LARGE`. Фронт показывает локализованный текст по коду.

---

## 7. Стратегия тестирования

**Что мокаем, что — реально**:
| Слой               | Unit (vitest)                  | Integration (jest+testcontainers)         | E2E (playwright)         |
|--------------------|--------------------------------|-------------------------------------------|--------------------------|
| LanguageModule     | реальный (чистая функция)      | —                                         | —                        |
| OcrProvider        | мок                            | TesseractProvider — реальный, cloud — мок | —                        |
| LlmProvider        | мок (vitest-mock-extended)     | мок (msw перехват HTTP)                   | мок                      |
| Redis / Bull       | ioredis-mock                   | testcontainers redis                      | реальный (docker-compose)|
| Translator         | мок LLM, реальный кеш          | реальный Redis, мок LLM                   | —                        |
| DocumentGenerator  | реальный (Puppeteer headless)  | реальный                                  | реальный                 |

**Golden documents** — кладём в `tests/fixtures/`:
- `golden_simple.pdf` — 1 страница, 5 ивритских блоков, 1 английский, 1 PNG-логотип. Эталон: `golden_simple.expected.json` (массив DocumentBlock с position/style/originalText). Перевод не сравниваем дословно (LLM недетерминистичен), но проверяем: количество блоков, координаты ±1pt, неизменность English-блока, неизменность изображения (sha256).
- `golden_simple.docx` — аналог.
- `golden_scan.pdf` — отсканированный документ (OCR-путь). Проверяем: блоки появились, confidence > 0.5, координаты совпадают с manually-аннотированной разметкой (`golden_scan.expected.json`).

**Pixel-position assertion (PVD ±1px)**:
1. Целевой документ рендерится в PNG через `pdf-to-img` (или Puppeteer повторно).
2. Эталон рендерится так же.
3. Для каждого блока берём его `position` (после translate-pipeline) и position в эталоне → diff в pt → assert `diff <= 1pt`.
4. Дополнительно — `pixelmatch` сравнение по bounding-boxes, диф порог 5%.

E2E-тест в Playwright: загрузить файл → дождаться socket `complete` → скачать → проверить sha256 не равен оригинальному (значит файл реально сгенерирован) → распарсить ответ pdfjs-dist'ом и проверить, что есть кириллица.

**CI**: GitHub Actions; unit и integration — на каждый push, e2e — на PR в main и nightly. Coverage gate — 70% для services/, 50% общий.
