# Переводчик документов с иврита

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Status](https://img.shields.io/badge/status-Phase%200%20live-brightgreen)

[English version](README.md) · Live: **https://translator.creatman.site**

Веб-сервис для перевода документов (PDF / DOCX) с иврита на английский с сохранением
структуры документа. Чистое ядро перевода с подключаемыми AI-провайдерами через
LiteLLM-прокси (Gemini free tier — основной, Claude через OpenRouter — fallback).

> **Статус — Phase 0 (v0.1.0):** публичный перевод he→en текстового уровня, захардненный
> и развёрнутый. Полная реконструкция вёрстки (DOCX in-place XML, PDF overlay) и OCR для
> сканов — на роадмапе. См. [CHANGELOG](./CHANGELOG.md) и
> `docs/plans/2026-06-01-hebrew-translator-production-design.md`.

## Возможности
- Загрузка PDF или DOCX, скачивание переведённого документа.
- he→en (ядро также поддерживает he→ru/he→ar).
- Асинхронная обработка с прогрессом по WebSocket (изолированно по сессии).
- Кэш переводов (с учётом модели и версии промпта).
- Security-базлайн: валидация по magic-bytes, лимиты размера/страниц/zip-bomb,
  скачивание по токену с TTL, helmet, CORS и rate-limit из env.

## Стек
Node.js ≥18, Express, Bull + Redis, Socket.IO; AI через LiteLLM (Gemini/Claude, **без OpenAI**);
`pdf-parse`/`mammoth` (извлечение), `pdfkit`/`docx` (генерация); клиент React (CRA), MUI.

## Запуск и деплой
См. [README.md](README.md) (разделы Run / Environment / Deploy). Деплой: Docker / Coolify
на VPS `sec`, домен `translator.creatman.site`.

## Лицензия
MIT — см. [LICENSE](./LICENSE).
