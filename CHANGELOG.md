# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- README rewrite (EN + RU), CHANGELOG, CONTRIBUTING, validate CI workflow, architecture diagram.

## [1.0.0] - 2024

### Added
- Initial release: PDF/DOCX upload, language detection, Hebrew→RU/EN translation with format preservation.
- Bull/Redis job queue, Socket.IO progress.
- Google Translate and OpenAI backends.
- Tesseract.js OCR fallback for scanned PDFs.
- Vitest unit tests, Jest integration tests, Playwright e2e.
- Docker and docker-compose deployment.
