# Переводчик документов с иврита

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/CreatmanCEO/hebrew_doc_translator?style=flat)](https://github.com/CreatmanCEO/hebrew_doc_translator/stargazers)
[![Validate](https://github.com/CreatmanCEO/hebrew_doc_translator/actions/workflows/validate.yml/badge.svg)](https://github.com/CreatmanCEO/hebrew_doc_translator/actions/workflows/validate.yml)
![Status](https://img.shields.io/badge/status-beta-yellow)
![Platform](https://img.shields.io/badge/platform-Node.js%2018%2B-339933?logo=node.js&logoColor=white)

[English version](README.md)

Веб-приложение для перевода PDF и DOCX документов с иврита на русский или английский с сохранением вёрстки, изображений и блоков со смешанными языками. Ивритский текст определяется поблочно, переводится и записывается обратно в документ с правильной обработкой RTL/LTR.

## Зачем это

Готовые переводчики либо ломают форматирование, либо плохо работают с документами, где иврит перемешан с латиницей и кириллицей. Здесь сохраняется исходная структура (абзацы, таблицы, изображения, разметка страниц), а переводятся только ивритские фрагменты — на выходе документ выглядит как оригинал, но на нужном языке.

## Как работает

1. **Загрузка** — PDF или DOCX через веб-клиент.
2. **Анализ** — `DocumentAnalyzer` и `LayoutExtractor` обходят дерево документа и извлекают текстовые блоки с координатами.
3. **Определение языка** — `franc` + эвристика помечают каждый блок как ивритский / неивритский.
4. **Перевод** — ивритские блоки уходят в Google Translate или OpenAI; остальные проходят без изменений.
5. **Сборка** — текст пишется обратно в новый DOCX (`docx`) или PDF (`pdfkit`) с сохранением порядка, направления RTL и позиций изображений.
6. **Выдача** — файл возвращается через прогресс по Socket.IO и HTTP-загрузку.

Очередь на Bull/Redis обрабатывает длинные задачи; для сканированных PDF подключается OCR (`tesseract.js`).

## Стек

| Слой | Инструменты |
|---|---|
| Сервер | Node.js, Express, Socket.IO |
| Очередь | Bull на Redis (ioredis) |
| Перевод | Google Cloud Translate, OpenAI |
| Парсинг документов | `mammoth`, `docx`, `docx4js`, `pdf-parse`, `pdf.js-extract` |
| OCR | `tesseract.js` |
| Определение языка | `franc`, `hebrew-transliteration` |
| Вывод | `docx`, `pdfkit` |
| Тесты | Vitest, Jest (integration), Playwright (e2e) |
| Ops | Docker, docker-compose |

Диаграмма пайплайна — [`docs/architecture.svg`](docs/architecture.svg).

## Быстрый старт

```bash
cp .env.example .env   # заполнить GOOGLE_*/OPENAI_* и Redis URL
npm install
npm run dev:full       # сервер + клиент
```

Через Docker:

```bash
docker-compose up
```

## Ограничения

- Определение иврита на очень коротких блоках (< 5 символов) может ошибаться — такие блоки могут остаться без перевода.
- Сканированные PDF зависят от качества `tesseract.js` — рукописный ввод и шумные сканы не гарантированы.
- Сложные элементы DOCX (сноски, вложенные диаграммы, режим правок) сохраняются как есть, но текст внутри не переводится.
- Лимиты Google Translate / OpenAI ограничивают большие документы; очередь делает ретраи, но не обходит квоту.
- Бета — интерфейс и API могут меняться.

## Автор

**Николай Подоляк** — независимый разработчик, автоматизация и интеграция AI.

- GitHub: [@CreatmanCEO](https://github.com/CreatmanCEO)
- Habr: [creatman](https://habr.com/ru/users/creatman/)
- Telegram: [@Creatman_it](https://t.me/Creatman_it)
- Сайт: [creatman.site](https://creatman.site)
