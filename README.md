# Hebrew Document Translator

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/CreatmanCEO/hebrew_doc_translator?style=flat)](https://github.com/CreatmanCEO/hebrew_doc_translator/stargazers)
[![Validate](https://github.com/CreatmanCEO/hebrew_doc_translator/actions/workflows/validate.yml/badge.svg)](https://github.com/CreatmanCEO/hebrew_doc_translator/actions/workflows/validate.yml)
![Status](https://img.shields.io/badge/status-beta-yellow)
![Platform](https://img.shields.io/badge/platform-Node.js%2018%2B-339933?logo=node.js&logoColor=white)

[Русская версия](README.ru.md)

Web app that translates PDF and DOCX documents from Hebrew into Russian or English while preserving layout, images, and mixed-language blocks. Hebrew text is detected per block, translated, and written back into the original document with RTL/LTR handling intact.

## Why this exists

Off-the-shelf translation tools either drop formatting or fail on documents with mixed Hebrew + Latin/Cyrillic content. This project keeps the source structure (paragraphs, tables, images, page layout) and only rewrites the Hebrew portions, so the output looks like the original — just translated.

## How it works

1. **Upload** — PDF or DOCX through the web client.
2. **Analyze** — `DocumentAnalyzer` and `LayoutExtractor` walk the document tree and extract text blocks with positioning metadata.
3. **Detect language** — `franc` + heuristics tag each block as Hebrew / non-Hebrew.
4. **Translate** — Hebrew blocks go through Google Translate or OpenAI; non-Hebrew blocks are passed through.
5. **Reassemble** — text is written back into a fresh DOCX (`docx`) or PDF (`pdfkit`) preserving order, RTL direction, and image placement.
6. **Deliver** — file is returned via Socket.IO progress updates and an HTTP download.

A Redis-backed Bull queue handles long jobs; OCR (`tesseract.js`) is used as a fallback when PDFs contain scanned pages.

## Tech stack

| Layer | Tools |
|---|---|
| Server | Node.js, Express, Socket.IO |
| Queue | Bull on Redis (ioredis) |
| Translation | Google Cloud Translate, OpenAI |
| Document parsing | `mammoth`, `docx`, `docx4js`, `pdf-parse`, `pdf.js-extract` |
| OCR | `tesseract.js` |
| Language detection | `franc`, `hebrew-transliteration` |
| Output | `docx`, `pdfkit` |
| Tests | Vitest, Jest (integration), Playwright (e2e) |
| Ops | Docker, docker-compose |

See [`docs/architecture.svg`](docs/architecture.svg) for the pipeline diagram.

## Quick start

```bash
cp .env.example .env   # fill GOOGLE_*/OPENAI_* and Redis URL
npm install
npm run dev:full       # server + client
```

Or with Docker:

```bash
docker-compose up
```

## Tests

```bash
npm test               # unit (vitest)
npm run test:integration
npm run test:e2e       # playwright
```

## Limitations

- Hebrew language detection on very short blocks (< 5 chars) can misfire; those blocks may be left untranslated.
- Scanned PDFs depend on `tesseract.js` quality — handwriting and noisy scans are not reliable.
- Complex DOCX features (footnotes, embedded charts, tracked changes) are preserved as-is but not translated inside.
- Rate limits of Google Translate / OpenAI can throttle large documents; the Bull queue retries but does not bypass quota.
- Beta — interface and API may change.

EOF
