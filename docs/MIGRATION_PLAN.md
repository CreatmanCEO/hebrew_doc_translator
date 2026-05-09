# MIGRATION_PLAN.md — План переписки (Phase 0 design)

> Статус: **draft, требует ревью**. План реализует архитектуру из `ARCHITECTURE.md`. Никакой код по этому плану ещё не пишется — нужно подтверждение пользователя.

Аудит: вердикт **B (частичная переписка)**. Сохраняем каркас (Express, Bull, multer, socket.io, фронтенд-скелет), переписываем ядро обработки документа и LLM-слой. Иврит — MVP, архитектура language-agnostic.

---

## 1. Файлы — оставить как есть

| Путь | Почему оставить |
|------|-----------------|
| `client/src/components/DocumentUpload.js` | Drag-n-drop работает, поправки косметические |
| `client/src/components/DocumentPreview.js` | Базовый предпросмотр, перепишется в Phase 2 на Vite |
| `client/src/components/TranslationProgress.js` | Хорошая обёртка над socket events |
| `server/middleware/errorHandler.js` | Стандартный Express middleware |
| `server/middleware/progressTracker.js` | Логика socket.io адекватна, оставляем |
| `server/api/health.js` | Простой health-check |
| `Dockerfile`, `docker-compose.yml` | Нуждаются в коррекции (см. §3), но базис ок |
| `LICENSE`, `CONTRIBUTING.md`, `README.md` | Не код |
| `playwright.config.js` | Конфиг ок, тесты будем добавлять |

---

## 2. Файлы — удалить

| Путь | Причина |
|------|---------|
| `server/documentProcessor.js` | "Плоский" пайплайн без позиций — ядро бага PVD; полностью заменяется новым DocumentAnalyzer/TextExtractor/DocumentGenerator |
| `server/documentGenerator.js` (root, не в services/) | Дубль; путаница, какой используется |
| `server/services/DocumentAnalyzer.js` | Существующая реализация не интегрирована и не покрывает PDF/DOCX корректно — переписать с нуля проще |
| `server/services/TextExtractor.js` | Использует deprecated `pdf.js-extract`, OCR-логика отсутствует, language detection однопроходный |
| `server/services/DocumentGenerator.js` | Игнорирует `block.position`/`block.style` — главный баг |
| `server/services/LayoutExtractor.js` | Функционал поглощается новым DocumentAnalyzer |
| `server/services/Translator.js` | Использует openai v3 API при openai@4 в package.json — не запустится; переписать под `LlmProvider` |
| `server/services/ApiKeyManager.js` | Самописный менеджер ключей — лишний; всё через env+zod |
| `server/services/ValidationService.js` | Сольётся в `server/config/env.js` (zod) и multer-фильтр |
| `server/services/LoggingService.js` | Заменяется winston-конфигом + `pino` (легче) — решить позже, см. open questions |
| `server/models/DocumentBlock.js` (если class-based) | Заменяется типизированной фабрикой + JSDoc; class не нужен |
| `server/models/LayoutInfo.js` | То же |
| `package.json` зависимости: `openai`, `pdf-parse`, `pdf.js-extract`, `pdfkit`, `docx4js`, `hebrew-transliteration` | openai — запрещён политикой; pdf-parse/pdf.js-extract → pdfjs-dist напрямую; pdfkit → Puppeteer; docx4js → mammoth уже есть; hebrew-transliteration переедет в `LanguageModule` если понадобится |
| `tests/**` существующие | Mock-everything тесты бесполезны; переписать вместе с кодом |
| `docs/architecture.svg` | Устарел, заменяется ASCII/mermaid в ARCHITECTURE.md |

---

## 3. Файлы — переписать

| Путь | Что меняется |
|------|--------------|
| `server/index.js` | Импорт zod-валидированного config; убрать `global.app`; разделить bootstrap API и worker; убрать прямую инициализацию Bull в роутах; helmet вернуть включённым |
| `server/api/translate.js` | Убрать инициализацию Queue — только `getQueue()` из общего модуля; multer-настройки вынести; обработчик процесса очереди уехал в worker |
| `package.json` (root) | Убрать openai/pdf-parse/pdfkit/docx4js/hebrew-transliteration; добавить `zod`, `pdfjs-dist`, `puppeteer`, `sharp`, `image-size`, `@anthropic-ai/sdk` ИЛИ `openai-compatible` для OpenRouter, `@google-cloud/vision` (опционально), `@azure/cognitiveservices-computervision` (опционально), `pino`, `ioredis-mock` (dev) |
| `server/package.json` | Синхронизировать с root; решить — оставлять ли отдельный или мерджить в один |
| `Dockerfile` | Multi-stage build; добавить установку Chromium-зависимостей для Puppeteer; tesseract-ocr binary (с heb-traineddata) |
| `docker-compose.yml` | Сервисы: `api`, `worker`, `redis`, `frontend`. Раздельный `worker` важен (см. ARCHITECTURE §1) |

---

## 4. Новые файлы — создать

```
server/
├── config/
│   └── env.js                       # zod schema из ARCHITECTURE §5
├── bootstrap.js                     # сборка реестров (LangRegistry, OcrChain, LlmProvider)
├── queue.js                         # фабрика Bull queue + ping-проверка Redis
├── worker.js                        # точка входа worker-процесса
│
├── languages/
│   ├── LanguageRegistry.js
│   └── HebrewModule.js              # MVP-язык
│
├── ocr/
│   ├── OcrChain.js
│   ├── TesseractProvider.js
│   ├── GoogleVisionProvider.js
│   └── AzureVisionProvider.js
│
├── llm/
│   ├── LlmProvider.js               # базовый интерфейс + retry/backoff
│   ├── OpenRouterProvider.js
│   ├── AnthropicProvider.js
│   ├── DeepSeekProvider.js
│   └── GeminiProvider.js
│
├── pipeline/
│   ├── DocumentAnalyzer.js          # pdfjs-dist + mammoth
│   ├── TextExtractor.js             # embedded-text path + OCR path
│   ├── Translator.js                # batch + cache по sha1
│   └── DocumentGenerator.js
│       ├── pdfRenderer.js           # Puppeteer HTML→PDF
│       └── docxRenderer.js          # docx-lib с bidirectional:true
│
├── models/
│   └── DocumentBlock.js             # фабрика + JSDoc типы
│
└── utils/
    ├── logger.js                    # pino
    ├── retry.js                     # exponential backoff
    └── hash.js                      # sha1 для translation cache key

tests/
├── fixtures/
│   ├── golden_simple.pdf
│   ├── golden_simple.expected.json
│   ├── golden_simple.docx
│   ├── golden_simple_docx.expected.json
│   ├── golden_scan.pdf
│   └── golden_scan.expected.json
├── unit/                            # vitest
├── integration/                     # jest + testcontainers
└── e2e/                             # playwright
```

---

## 5. Фазированный график

Обозначения сложности: **S** ≤ 1 день, **M** 2–4 дня, **L** ≥ 1 неделя.

### P0 — Foundation (блокирующий каркас)

| # | Задача | Сложность | Зависит от | Acceptance |
|---|--------|-----------|------------|------------|
| P0-1 | Создать `config/env.js` (zod), удалить `ApiKeyManager`/`ValidationService` | S | — | `node -e "require('./server/config/env')"` падает с понятной ошибкой при пустом env, успешен при валидном `.env.example` |
| P0-2 | Завести `queue.js` с fail-fast Redis ping | S | P0-1 | Сервер при недоступном Redis выходит с кодом 1 за ≤ 5 сек |
| P0-3 | Разделить API и worker (`server/worker.js`), убрать Bull из импорта роутов | M | P0-2 | `npm start` (API) и `npm run worker` поднимаются раздельно; вызовы импортов не создают side-effect Queue |
| P0-4 | Чистка `package.json`: удалить openai/pdfkit/etc., добавить новые deps; синхронизировать root и server | S | — | `npm ci` проходит, `node server/index.js` стартует (без worker-логики) |
| P0-5 | Базовый `LanguageRegistry` + `HebrewModule` (только code/direction/detector) | S | P0-4 | unit-тест: `registry.detect('שלום')` → `'he'`; `registry.detect('hello')` → не `'he'` |
| P0-6 | Каркас `LlmProvider` + `OpenRouterProvider` (только translate, без batch) | M | P0-4 | integration-тест с msw возвращает мок-перевод |
| P0-7 | Подготовка golden fixtures (вручную создать 3 документа + JSON-эталоны) | M | — | Файлы лежат в `tests/fixtures/`, JSON-эталоны валидны по zod-схеме DocumentBlock |

### P1 — Core pipeline

| # | Задача | Сложность | Зависит от | Acceptance |
|---|--------|-----------|------------|------------|
| P1-1 | `DocumentAnalyzer` — PDF (pdfjs-dist) | M | P0-7 | На `golden_simple.pdf` возвращает массив raw-элементов с позициями, отклонение от эталона ±1pt |
| P1-2 | `DocumentAnalyzer` — DOCX (mammoth + docx-lib) | M | P0-7 | На `golden_simple.docx` возвращает корректную структуру |
| P1-3 | `TesseractProvider` + `OcrChain` (с одним провайдером) | M | P0-5 | На `golden_scan.pdf` confidence > 0.5, текст распознан |
| P1-4 | `TextExtractor` — выбор пути embedded vs OCR | M | P1-1, P1-3 | Возвращает массив `DocumentBlock` с position+style+language |
| P1-5 | `Translator` с batch и Redis-кешем | M | P0-6 | Повторный перевод того же блока не делает HTTP-запрос (cache hit); 50 блоков → ≤ 5 LLM-запросов |
| P1-6 | `DocumentGenerator` — DOCX (docx lib, `bidirectional:true`) | M | P1-4 | На golden DOCX: позиции/стили совпадают с эталоном, иврит RTL |
| P1-7 | `DocumentGenerator` — PDF (Puppeteer HTML→PDF) | L | P1-4 | На golden PDF: pixel-diff ≤ 5% по bbox, координаты ±1pt |
| P1-8 | Wire pipeline в `worker.js`; socket-progress по этапам | M | P1-1..P1-7 | E2E: загрузил → получил `complete` → скачал → файл валиден |
| P1-9 | Error handling: failures < 20% threshold, warnings, машиночитаемые коды | S | P1-8 | Тест: 1 блок завален → файл скачивается с warning; >20% завалены → status=failed |

### P2 — Hardening + frontend

| # | Задача | Сложность | Зависит от | Acceptance |
|---|--------|-----------|------------|------------|
| P2-1 | `GoogleVisionProvider` (или `AzureVisionProvider` — по выбору юзера) | M | P1-3 | Fallback срабатывает при confidence < threshold |
| P2-2 | Тестовое покрытие: unit ≥ 70% для services/, integration на real Redis (testcontainers) | M | P1-* | Coverage report; CI green |
| P2-3 | Pixel-position assertion harness (`pdf-to-img` + `pixelmatch`) | M | P1-7 | CI-job сравнивает рендер с эталоном |
| P2-4 | Миграция фронтенда CRA → Vite + React 18 | M | — | `npm run dev` стартует Vite; existing components работают без правок логики |
| P2-5 | GitHub Actions: lint+unit на push, integration+e2e на PR, nightly | S | P2-2 | Workflow-файлы; зелёный билд |
| P2-6 | Документация (README, .env.example, runbook) | S | P1-* | Новый разработчик может поднять локально по README |
| P2-7 | Логирование: pino + структурированные поля (jobId, blockId, provider) | S | P1-8 | Логи в JSON, поиск по jobId работает |

### P3 — Готовность к новым языкам (не для MVP, но проверить готовность)

| # | Задача | Сложность | Зависит от | Acceptance |
|---|--------|-----------|------------|------------|
| P3-1 | Документ "Как добавить язык" — пошаговый | S | P2-* | Включает шаблон LanguageModule с TODO-комментариями |
| P3-2 | Smoke-тест: создать заглушку `ArabicModule` (пустой detector), убедиться, что регистрация не ломает hebrew-pipeline | S | P3-1 | Тест регистрирует оба модуля, hebrew-кейс по-прежнему зелёный |

---

## 6. Risk register

| # | Риск | Вероятность | Воздействие | Митигация |
|---|------|-------------|-------------|-----------|
| R1 | Puppeteer не даёт пиксель-в-пиксель по горизонтальным координатам RTL-текста (Chrome применяет свой kerning) | Средняя | Высокое (главное требование PVD ±1px) | Прототип на P1-7 первым делом — сравнить с эталоном; при провале fallback план: pdf-lib + harfbuzzjs только для текстовых блоков, Puppeteer для layout-каркаса |
| R2 | OpenRouter недоступен / у пользователя нет ключа | Средняя | Среднее | Архитектура `LlmProvider` уже допускает прямой Anthropic; перейти — это смена env и одного импорта |
| R3 | Tesseract на Windows-dev и Linux-prod даёт разные результаты | Средняя | Среднее | Тестируем только в Docker-контейнере (linux); Windows-dev — best-effort |
| R4 | Размер Docker-образа (Chromium + tesseract + node_modules) > 1.5 GB | Высокая | Низкое | Multi-stage build, alpine где можно, сохранять Chromium отдельным слоем |
| R5 | LLM перевирает термины между блоками (нет контекста) | Высокая | Среднее | `TranslateRequest.context` (before/after) + batch + системный промпт "preserve domain terms"; для high-stake документов — добавить glossary param в P3 |

---

## 7. Open questions for user

1. **OpenRouter ключ**: есть ли у пользователя активный аккаунт OpenRouter? Если нет — переключаемся на прямой Anthropic API (есть ключ `ANTHROPIC_API_KEY`?). Вопрос блокирует P0-6.
2. **Cloud OCR**: какой провайдер предпочтительнее — Google Vision или Azure Vision? Или поддерживать оба и выбирать env-переменной (стоит больше работы в P2-1)?
3. **Слияние package.json**: оставить отдельные `package.json` в root и `server/`, или объединить в один (workspaces)? Текущее разделение мутно — root содержит зависимости, которые сервер не использует и наоборот.
4. **DOCX точность**: критерий "±1 пиксель" из PVD — реалистичен только для PDF. В DOCX позиционирование — относительное (параграфы, не абсолютные координаты). Подтвердить, что для DOCX достаточно: правильный порядок блоков + сохранение стилей + RTL, без пиксельной точности.
5. **Logger**: оставить winston (как в существующем коде) или переехать на pino (быстрее, JSON-native)? Косметика, но определимся сразу.
6. **Frontend Phase 2**: миграция на Vite — отдельный спринт или параллельно с backend? Если параллельно — нужен второй разработчик или больше времени.
7. **Сохранять ли существующую схему API** (`POST /api/translate` + Socket.IO) или менять на REST polling? Текущая — рабочая, менять смысла нет, но подтвердим.
8. **Целевые языки перевода**: PVD упоминает русский и английский как target. Подтвердить, что MVP — только `he → ru` и `he → en`, без обратного направления.
