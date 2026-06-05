# Hebrew Translator — UI redesign + i18n (design)

**Date:** 2026-06-05
**Status:** Approved (design-lock)
**Context:** Current UI is bare default MUI (centered column, raw dropzone) — unpolished. Redesign to clean minimal light, and add 3-language interface (he/en/ru) with RTL for Hebrew. Executed together with the PDF→structure sub-phase (the StructuredViewer is built in the new style).

## Decisions (locked)
| Topic | Decision |
|-------|----------|
| Visual style | Clean minimal, **light** (CREATMAN calm/quality vibe) |
| Framework | Keep MUI; replace look via custom theme + redesigned screens (no framework swap) |
| Accent | Calm indigo `#4F46E5` (tweakable) |
| UI languages | **he / en / ru** with a header switcher, persisted, browser-default → EN fallback |
| RTL | Hebrew UI → `theme.direction='rtl'` + `document.dir` + `stylis-plugin-rtl` |
| i18n engine | Lightweight in-house dictionary + `useT()` context (no i18next — YAGNI) |

## Theme (`client/src/theme.js`)
MUI `createTheme`: palette (bg `#F7F8FA`, surface `#FFFFFF`, text `#1A1A1A`/`#5A5A6A`, primary `#4F46E5`); typography Inter/system; `shape.borderRadius 14`; soft shadows; generous spacing. A factory `makeTheme(direction)` returns LTR or RTL theme.

## i18n
- `client/src/i18n.js`: `dict = { he:{...}, en:{...}, ru:{...} }` for all UI strings; `LanguageProvider` (context) holding `uiLang` (localStorage `uiLang`, default = browser lang if in {he,en,ru} else 'en'); `useT()` → `t(key)`.
- Header `LanguageSwitcher` (HE/EN/RU). On `he` → set `document.dir='rtl'` + RTL theme/emotion cache; else LTR.
- **UI language ≠ document translation target** — separate state.

## Screens
- **Header**: slim bar — wordmark (localized) left; language switcher + admin usage chip right. Centered max-width container.
- **Upload card**: friendly dropzone (icon + localized hint + size limit), target-language segmented control (EN/RU for the document), states (idle/disabled/loading).
- **Progress**: clean stepper/progress with localized status (Uploading → Processing → Done).
- **Result**: success card (filename, prominent **Download DOCX** button), **StructuredViewer** below (source RTL | target LTR; headings/lists/tables; element hover-highlight), "Translate another" reset.
- **Admin usage**: subtle chip/panel (key-gated): model · tokens · $.
- **Responsive**: panes stack on mobile (iPhone is a real client); fluid.
- **States**: empty/error/loading; transitions; favicon/title localized.

## Tech / scope
- New: `theme.js`, `i18n.js`, `LanguageSwitcher`, `rtl cache` wiring in `index.js` (ThemeProvider + CacheProvider). Restyle `App.js` + `DocumentUpload`/`TranslationProgress`/`DocumentPreview`; build `StructuredViewer` in the new style. Optional dep `@fontsource/inter`; required dep `stylis-plugin-rtl` (+ `@emotion/cache` present via MUI).

## Guardrails
- 🟡 Accessibility: contrast (AA), visible focus, keyboard, alt/aria.
- 🟡 Responsive verified on mobile.
- 🟡 RTL correctness for Hebrew UI (mirrored layout, not just text).
- 🟡 No overflow/layout-shift on long translations / mixed RTL-LTR.
- 🟢 Viewer XSS already handled (React nodes).
- 🟢 All user-facing strings localized (no hardcoded text).

## Scope (YAGNI)
**In:** clean light theme, 3-language UI (he/en/ru) + RTL, redesigned screens, StructuredViewer styled, responsive, a11y basics.
**Out:** dark mode, full WCAG audit, animations beyond subtle transitions, per-string admin localization beyond the main set.
