# Hebrew Document Translator - Development Control Log

## Project Overview
Web application for translating documents from Hebrew to Russian and English while preserving original formatting and handling mixed content.

## Project Status
**Current Stage:** CI/CD Setup with GitHub Actions  
**Last Update:** 27.01.2025  
**Status:** Active Development

## Recent Changes & Plans

### Latest Updates (27.01.2025)
1. Fixed Development Infrastructure:
   - ✓ ESLint configuration updated
   - ✓ Modern JS/ES modules support
   - ✓ Test environment setup
   - ✓ Translation service upgrade
   - ⧖ GitHub Actions setup

2. Translation Features:
   - ✓ Hebrew Transliteration (v2.7.0)
   - ✓ Rate limiting implementation
   - ✓ Batch processing for documents
   - ✓ Error handling system

### Upcoming Tasks
- Complete GitHub Actions workflow
- Set up automated testing
- Add quality monitoring

## Project Architecture

### Structure
```
hebrew-doc-translator/
├── server/
│   ├── api/
│   │   └── translate.js       # Translation endpoint
│   ├── services/
│   │   ├── DocumentGenerator  # Output generation
│   │   ├── LayoutExtractor   # Format preservation
│   │   └── Translator        # Translation logic
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── fileValidation.js # Using mime-types
│   └── index.js              # Express setup
├── client/                   # React frontend
└── tests/                   # ES modules enabled
```

### Core Features
```javascript
Translation Pipeline:
Doc → Extract → Transliterate → Translate → Format → Output

Supported Formats:
- Input: PDF, DOCX
- Output: Same as input
- Mixed content handling

Rate Limiting:
- 100 requests/minute
- Batch size: 10 blocks
- Auto-recovery
```

## Technical Stack

### Backend Services
```javascript
Translation:
- hebrew-transliteration: "^2.7.0"
- Rate limiting & batching
- Format preservation

Document Processing:
- PDF: pdf.js-extract
- DOCX: mammoth
- Mime detection: mime-types
```

### Development Tools
```javascript
Testing:
- Vitest + ESM support
- Jest for integration
- Playwright for E2E

Linting:
- ESLint with modern config
- Support for ES modules
- Custom rules for tests
```

## API Documentation

### Endpoints
```http
POST /api/translate
GET /api/status/:jobId
GET /api/download/:jobId
```

### Development Guidelines
```javascript
// ES Modules in Tests
import { expect } from 'vitest'
import { render } from '@testing-library/react'

// CommonJS in Core
const express = require('express')
```

## Error Handling
```javascript
Categories:
1. API limits
2. File processing
3. Translation errors
4. Format issues
```

## Known Issues
1. Max file size: 10MB
2. Rate limits: 100 req/min
3. Processing delays

## Change History

### 27.01.2025
- ESLint modern config
- Translation upgrades
- Test environment fixes

### 26.01.2025
- Project init
- Base structure
- Dev setup