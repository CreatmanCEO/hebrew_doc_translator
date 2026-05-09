# ARCHITECTURE.md — Целевая архитектура (Phase 0 design)

> Статус: **draft, требует ревью**. Этот документ описывает целевое состояние после частичной переписки. Текущий код в `main` не соответствует этому плану — см. `MIGRATION_PLAN.md`.

Аудит вынес вердикт **B (частичная переписка)**: фронтенд-скелет, Express, Bull, multer и socket.io остаются; ядро обработки документа и LLM-слой переписываются. Иврит — единственный язык в MVP, но архитектура с первого дня **language-agnostic**: добавление арабского, фарси, идиша или урду — это новый файл-плагин, без изменений в ядре.

---

## 1. Структура репозитория (npm workspaces monorepo)

Проект переводится в monorepo на `npm workspaces`. Один lockfile, общие типы и интерфейсы — в `packages/shared/`.

```
hebrew_doc_translator/
├── package.json          # root, "workspaces": ["packages/*"]
├── package-lock.json     # единый lockfile
├── packages/
│   ├── api/              # Express + Bull + worker (бывший server/)
│   ├── client/           # React + Vite (бывший client/)
│   └── shared/           # общие контракты — см. ниже
```

Содержимое `packages/shared/`:
- типы `DocumentBlock`, `Position`, `Style`, `LangCode`;
- интерфейсы `LanguageModule` + MVP-импл `HebrewModule`;
- интерфейсы `OcrProvider`, `LlmProvider`;
- zod-схемы env (импортируются и в `api/`, и в инструментах CI).

В тексте документа далее пути `server/...` означают `packages/api/...` после миграции (см. P0 в `MIGRATION_PLAN.md`).

## 2. Системный обзор

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
   │   └─ OCR path: OcrChain (2 уровня)                   │
   │        ├─ L1 TesseractProvider (local, free, v6)     │
   │        └─ L2 Cloud (Google Vision default | Azure)   │
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

**Границы очереди.** API-роут только валидирует и кладёт задачу в Bull; вся тяжёлая работа — в worker-процессе (`server/worker.js`). Worker импортируется из того же кода (`packages/api/`), но запускается отдельной командой (`npm run worker -w @hdt/api`) и в Docker — отдельным сервисом. Это позволяет масштабировать workers независимо и не убивать API при OOM в OCR.

---

## 3. Базовые интерфейсы

Все интерфейсы — JSDoc + TypeScript-сигнатуры в комментариях. Реальные файлы — обычный JS (CommonJS), но контракты строго следуем.

### 3.1 `DocumentBlock`

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

### 3.2 `LanguageModule`

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

### 3.3 `OcrProvider`

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

### 3.4 `LlmProvider`

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

### 3.5 Классы пайплайна

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

## 4. Provider registry

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
  constructor(providers /* OcrProvider[] */, minConfidence = 0.75) {
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

## 5. Технологические решения

### 5.1 LLM-провайдер — **OpenRouter** (рекомендация), Anthropic Claude как fallback

Выбран OpenRouter: один API, маршрутизация на Claude / DeepSeek / Gemini, единый биллинг, можно экспериментировать с моделями без переписывания кода. Для перевода связного текста на иврите целевая модель — `anthropic/claude-sonnet-4` (лучшее качество на семитских языках по бенчмаркам, поддерживает batch). DeepSeek (`deepseek/deepseek-chat`) — дешёвая альтернатива для черновых переводов и тестов. **Отвергнуто**: OpenAI (политика пользователя), прямой Gemini как primary (хуже на иврите по нашим тестам у других проектов). Архитектурно `LlmProvider` остаётся абстракцией — можно подменить на прямой Anthropic SDK без изменений в Translator. Открытый вопрос — наличие у пользователя OpenRouter-ключа (см. MIGRATION_PLAN, Open questions).

### 5.2 PDF generation — **Puppeteer (HTML→PDF)**

`pdfkit` — слабое RTL и нет shaping для арабского/фарси (что критично для будущих языков). `pdf-lib + harfbuzzjs` — даёт точность, но требует ручного позиционирования каждого глифа и собственного layout-engine; это месяцы работы. **Puppeteer** генерирует HTML с CSS `direction: rtl`, `unicode-bidi: plaintext`, `font-family` из LanguageModule, и Chrome нативно делает RTL/shaping/kerning. Координаты блоков задаются через `position: absolute; left/top/width/height` в pt — Chrome сохраняет их при печати в PDF. Минус: тяжелый рантайм (Chromium ~300MB), но в Docker это решается заранее. **Отвергнуто**: pdfkit (RTL слабый), pdf-lib+harfbuzz (слишком низкоуровневый для соло-разработчика).

### 5.3 PDF parsing — **pdfjs-dist** (прямой импорт)

`pdf-parse` — даёт только plain text без позиций. `pdf2json` — ставится отдельным CLI и medlennый. **pdfjs-dist** — официальная библиотека Mozilla, даёт `getTextContent()` с координатами каждого `TextItem` (transform-матрица → x/y/scale), плюс `getOperatorList()` для извлечения изображений. Уже используется через `pdf.js-extract`, но переходим на прямой API для контроля. **Отвергнуто**: pdf2json (deprecated практически), PDFium binding (нативный, проблемы с Windows-сборкой).

### 5.4 OCR — финализированная 2-уровневая цепочка

**Решение принято и зафиксировано** (не пересматриваем без сильной причины).

- **Level 1 (локальный, бесплатный)**: `TesseractProvider` на `tesseract.js@^6` (см. §5.5). Запускается всегда первым.
- **Level 2 (облачный fallback)**: триггерится, когда блок Tesseract вернул `confidence < OCR_MIN_CONFIDENCE` (default `0.75`) **или** Tesseract выбросил исключение.
  - **Default cloud**: `GoogleVisionProvider` (`@google-cloud/vision`). Выбран за лучший трек-рекорд по RTL/редким письменностям — критично для будущих модулей `Arabic / Persian / Yiddish / Urdu`.
  - **Альтернатива**: `AzureVisionProvider`, подключается через env (`OCR_CLOUD_PROVIDER=azure`). Не дефолт.
- Интерфейс `OcrProvider` сохраняется — Google и Azure это две конкретные реализации, переключение — env-переменной без изменений в `OcrChain` или вызывающем коде.

**Cost projection** (для понимания масштаба): при ~1000 документов/мес × 3 страницы и 50% доле страниц, идущих в cloud-fallback, при тарифе Google Vision $1.50 / 1000 страниц и бесплатных первых 1000 страниц/мес ожидаемая стоимость ≈ **$0.75/мес**. Для MVP-объёма — пренебрежимо.

#### Rejected alternatives (не возвращаемся)

- **ocr.space** — отвергнут окончательно. Причины:
  1. Иврит не указан в явной матрице поддерживаемых языков.
  2. Free tier слишком жёсткий: 1 МБ на файл, 3 страницы PDF, 500 запросов/день — не покрывает даже маленький MVP-всплеск.
  3. Paid tier $30/мес не оправдан как fallback при наличии бесплатной квоты у Google Vision.
- **OpenAI Vision / GPT-4o OCR** — запрещён политикой пользователя (см. также §5.1).
- **Прямой Tesseract C++ binding** (без `tesseract.js`) — добавляет нативную сборку, ломает Windows-dev. v6 wrapper покрывает наши потребности.

### 5.5 Tesseract.js v6

Тёкущий MVP-pin будет `tesseract.js@^6.1.2` (wrapper над движком Tesseract C++ 5.5.2, релиз дек. 2024). Иврит-traineddata формата `.traineddata` совместим без изменений. Миграция с v5: формат API в основном внутренний, точечные правки точек вызова делаются в P0-задаче (см. `MIGRATION_PLAN.md`).

### 5.6 Frontend build — **Vite + React 18** (Phase 2)

CRA deprecated с 2024. Vite даёт HMR за миллисекунды, ESM-only сборку, нативный TS. Миграция — Phase 2 (после стабилизации backend). В Phase 1 фронтенд остаётся CRA — фокус на бэкенд.

---

## 6. Конфигурация

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
  OCR_CLOUD_PROVIDER: z.enum(['google', 'azure', 'none']).default('google'),
  OCR_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.75),
  // Google Vision (default cloud provider) — обязателен при OCR_CLOUD_PROVIDER=google
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(), // путь к service-account JSON, e.g. ./secrets/google-vision-sa.json
  // Azure Vision — опциональный alt provider (OCR_CLOUD_PROVIDER=azure)
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
  if (cfg.OCR_CLOUD_PROVIDER === 'google' && !cfg.GOOGLE_APPLICATION_CREDENTIALS)
    ctx.addIssue({ code: 'custom', message: 'GOOGLE_APPLICATION_CREDENTIALS required for OCR_CLOUD_PROVIDER=google' });
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

**Provisioned secrets / ключи (статус)**:

| Ключ / файл | Статус | Trigger-point подключения |
|-------------|--------|---------------------------|
| `secrets/google-vision-sa.json` (service-account) | Уже на диске, в `.gitignore` (commit `597d11c`). Подставляется в env как `GOOGLE_APPLICATION_CREDENTIALS=./secrets/google-vision-sa.json`. | Используется с момента включения cloud-fallback (P2-T01). |
| `OPENROUTER_API_KEY` | Есть у пользователя, **подключается на шаге P0-T08** при интеграции `LlmProvider` / `OpenRouterProvider`. До этого момента вопрос не поднимаем. | P0-T08 (см. `MIGRATION_PLAN.md`). |
| `AZURE_VISION_KEY` / `AZURE_VISION_ENDPOINT` | Опционально, провижится отдельно у пользователя; используется только при `OCR_CLOUD_PROVIDER=azure`. | Не нужен для default-конфигурации. |

---

## 7. Обработка ошибок

**OCR fallback** описан в §4 (`OcrChain`). Если последний провайдер вернул confidence ниже threshold — результат всё равно используется, но блок помечается флагом `lowConfidence: true`, и в финальном статусе пользователю отдаётся warning (не error).

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

## 8. Стратегия тестирования

**Что мокаем, что — реально**:
| Слой               | Unit (vitest)                  | Integration (jest+testcontainers)         | E2E (playwright)         |
|--------------------|--------------------------------|-------------------------------------------|--------------------------|
| LanguageModule     | реальный (чистая функция)      | —                                         | —                        |
| OcrProvider        | мок                            | TesseractProvider — реальный, cloud — мок | —                        |
| LlmProvider        | мок (vitest-mock-extended)     | мок (msw перехват HTTP)                   | мок                      |
| Redis / Bull       | ioredis-mock                   | testcontainers redis                      | реальный (docker-compose)|
| Translator         | мок LLM, реальный кеш          | реальный Redis, мок LLM                   | —                        |
| DocumentGenerator  | реальный (Puppeteer headless)  | реальный                                  | реальный                 |

**Целевая точность по форматам** (важное уточнение к PVD):

- **PDF — пиксельная точность ±1px** (как в PVD). Проверяется через `pdf-to-img` + `pixelmatch`.
- **DOCX — структурная эквивалентность** (без пиксельных ассертов). Проверяется:
  - тот же порядок параграфов (block order совпадает с эталоном);
  - те же style-теги (bold/italic/font-size/color);
  - корректное направление текста (`rtl`/`ltr`) у каждого run;
  - изображения присутствуют в логически верных позициях (тот же параграф/anchor, что в эталоне).
  Пиксельный diff к DOCX **не применяется** — формат относительный, и Word/LibreOffice рендерят по-разному.

**Golden documents** — кладём в `tests/fixtures/`:
- `golden_simple.pdf` — 1 страница, 5 ивритских блоков, 1 английский, 1 PNG-логотип. Эталон: `golden_simple.expected.json` (массив DocumentBlock с position/style/originalText). Перевод не сравниваем дословно (LLM недетерминистичен), но проверяем: количество блоков, координаты ±1pt, неизменность English-блока, неизменность изображения (sha256).
- `golden_simple.docx` — аналог; критерий — структурная эквивалентность (см. выше), без pixel-diff.
- `golden_scan.pdf` — отсканированный документ (OCR-путь). Проверяем: блоки появились, confidence > 0.5, координаты совпадают с manually-аннотированной разметкой (`golden_scan.expected.json`).

**Pixel-position assertion (PDF only, PVD ±1px)**:
1. Целевой документ рендерится в PNG через `pdf-to-img` (или Puppeteer повторно).
2. Эталон рендерится так же.
3. Для каждого блока берём его `position` (после translate-pipeline) и position в эталоне → diff в pt → assert `diff <= 1pt`.
4. Дополнительно — `pixelmatch` сравнение по bounding-boxes, диф порог 5%.

**DOCX assertion**: парсинг сгенерированного `.docx` через `mammoth` / `docx` lib и сверка со структурным эталоном `golden_simple_docx.expected.json` — список параграфов с тегами стилей, направлением и ссылками на изображения. Пиксельный рендеринг DOCX не используется.

E2E-тест в Playwright: загрузить файл → дождаться socket `complete` → скачать → проверить sha256 не равен оригинальному (значит файл реально сгенерирован) → распарсить ответ pdfjs-dist'ом и проверить, что есть кириллица.

**CI**: GitHub Actions; unit и integration — на каждый push, e2e — на PR в main и nightly. Coverage gate — 70% для services/, 50% общий.
