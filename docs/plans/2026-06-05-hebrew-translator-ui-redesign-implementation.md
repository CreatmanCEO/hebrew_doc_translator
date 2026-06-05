# UI redesign + i18n (he/en/ru) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the bare MUI UI with a clean minimal light design, a 3-language interface (he/en/ru) with a switcher and RTL for Hebrew, and a styled StructuredViewer — executed together with the PDF→structure sub-phase.

**Architecture:** Custom MUI theme (`makeTheme(direction)`), in-house i18n (`dict` + `LanguageProvider`/`useT`), emotion RTL cache via `stylis-plugin-rtl` for Hebrew UI, redesigned `App.js`/components, all strings localized.

**Tech Stack:** React (CRA) + MUI, @emotion (via MUI), stylis-plugin-rtl, optional @fontsource/inter, vitest/CRA jest.

**Design:** `docs/plans/2026-06-05-hebrew-translator-ui-redesign-design.md`. **Branch:** `feat/pdf-structure` (same branch — UI ships with the structure work). **Client tests:** `cd client && CI=true npx react-scripts test --watchAll=false <path>`.

> Run after the PDF→structure backend tasks (so the StructuredViewer renders real schemaVersion-2 docs). StructuredViewer itself is built here in the new theme (covers pdf-structure Task 5).

---

### Task U1: Deps + theme

```bash
cd client && npm install stylis-plugin-rtl @fontsource/inter && cd ..
```
**Files:** Create `client/src/theme.js`.
- `import { createTheme } from '@mui/material/styles';`
- `export function makeTheme(direction='ltr'){ return createTheme({ direction, palette:{ mode:'light', primary:{main:'#4F46E5'}, background:{ default:'#F7F8FA', paper:'#FFFFFF' }, text:{ primary:'#1A1A1A', secondary:'#5A5A6A' } }, shape:{ borderRadius:14 }, typography:{ fontFamily:'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }, components:{ MuiPaper:{ styleOverrides:{ root:{ boxShadow:'0 1px 3px rgba(16,24,40,.06),0 1px 2px rgba(16,24,40,.04)' } } } } }); }`
**Test** `client/src/__tests__/theme.test.js`: `makeTheme('rtl').direction==='rtl'`, `makeTheme().palette.primary.main==='#4F46E5'`, `shape.borderRadius===14`. Commit `feat(ui): light MUI theme + deps`.

---

### Task U2: i18n dictionary + provider + useT

**Files:** Create `client/src/i18n.js` + `client/src/__tests__/i18n.test.js`.
- `dict = { en:{...}, ru:{...}, he:{...} }` with keys for every UI string (title, upload hint, size limit, target-lang label, RU/EN options, statuses uploading/processing/done/error, download, translate-another, viewer source/target headers, admin usage labels). Provide all 3 languages.
- `const LanguageContext = createContext();`
- `export function LanguageProvider({children})`: `const [uiLang,setUiLang]=useState(()=>{ const s=localStorage.getItem('uiLang'); if(['he','en','ru'].includes(s)) return s; const b=(navigator.language||'en').slice(0,2); return ['he','en','ru'].includes(b)?b:'en'; });` persist on change (`useEffect`→localStorage + `document.documentElement.dir = uiLang==='he'?'rtl':'ltr'` + `lang` attr). Provide `{uiLang,setUiLang}`.
- `export function useT(){ const {uiLang}=useContext(LanguageContext); return (key)=> (dict[uiLang]&&dict[uiLang][key]) ?? dict.en[key] ?? key; }`
- `export function useUiLang(){ return useContext(LanguageContext); }`
**Test:** wrap a probe component in `LanguageProvider`; `useT()('download')` returns the EN string; switching `setUiLang('ru')` returns RU string; unknown key → key. (Use @testing-library renderHook or a small component.) Commit `feat(ui): in-house i18n (he/en/ru) provider + useT`.

---

### Task U3: LanguageSwitcher + RTL cache wiring

**Files:** Create `client/src/components/LanguageSwitcher.js`; modify `client/src/index.js`.
- `LanguageSwitcher`: a compact MUI ToggleButtonGroup (HE/EN/RU) bound to `useUiLang()`.
- `index.js`: wrap `<App/>` in `<LanguageProvider>` + an emotion `CacheProvider` whose cache uses `stylis-plugin-rtl` when `uiLang==='he'`, and `<ThemeProvider theme={makeTheme(dir)}>` + `<CssBaseline/>`. Since cache/theme depend on uiLang, put this wiring in a small inner component that reads `useUiLang()` and builds the rtl/ltr cache + theme (two static caches: `ltrCache=createCache({key:'mui'})`, `rtlCache=createCache({key:'muirtl',stylisPlugins:[prefixer, rtlPlugin]})`).
**Verify:** `cd client && CI=true npx react-scripts build` succeeds; switching to HE sets `document.dir='rtl'`. (Light test: render LanguageSwitcher in provider, click HE → `document.documentElement.dir==='rtl'`.) Commit `feat(ui): language switcher + RTL emotion cache`.

---

### Task U4: Redesign App shell + screens (localized, themed)

**Files:** Modify `client/src/App.js`, `client/src/components/DocumentUpload.js`, `client/src/components/TranslationProgress.js`, `client/src/components/DocumentPreview.js`.
- App shell: header (`AppBar`/`Toolbar` minimal) with localized wordmark + `LanguageSwitcher` (+ admin usage chip slot); centered `Container maxWidth="md"` content; `Box` background.
- Replace ALL hardcoded RU strings with `useT()` keys (upload hint, statuses, buttons, etc.).
- DocumentUpload: polished dropzone (rounded, dashed border, hover, icon, localized hint + size limit), target-language segmented control (EN/RU), disabled/loading states.
- TranslationProgress: clean status (stepper or LinearProgress + localized label), error state with retry.
- DocumentPreview/result: success card, prominent localized Download (DOCX) button, "translate another".
- Keep functional wiring (socket, upload, fetch result, download) intact.
**Verify:** `App.test.js` smoke still passes (mount in LanguageProvider+ThemeProvider — update the test's render wrapper); build clean. Commit `feat(ui): redesigned shell + screens, fully localized`.

---

### Task U5: StructuredViewer (new style) — also satisfies pdf-structure Task 5

**Files:** Create `client/src/components/StructuredViewer.js` + test; branch in `App.js` on `schemaVersion`.
- Render two columns (source `dir="rtl"` | target) of `doc.elements`: heading (Typography variant by level), paragraph, list (`List`/`<ul>/<ol>`), table (MUI `Table`). All text via React children; tables/lists via React elements (no `dangerouslySetInnerHTML`). Element-level hover/click highlight (active index → highlight paired element both sides) using theme accent. Localized column headers via `useT()`.
- `App.js`: `translationDoc.schemaVersion===2 ? <StructuredViewer/> : <SideBySideViewer/>`.
**Test:** render with heading/paragraph/list/table → target texts present; XSS fixture (target with `<img>`) literal. Commit `feat(ui): StructuredViewer (themed, element highlight, XSS-safe)`.

---

### Task U6: Responsive + a11y polish + verify

- Panes stack on small screens (`Grid` xs=12 / md=6); fluid widths; test at mobile width.
- a11y: color contrast AA, visible focus rings, `aria-label`s on icon buttons/switcher, `lang`/`dir` on root.
- Localize `<title>`/favicon (set document.title from useT in App effect).
- Run full client test suite + build. Commit `chore(ui): responsive + a11y polish, green build`.

---

## Acceptance criteria
- [ ] Clean light theme applied app-wide (no bare-MUI look)
- [ ] UI switchable he/en/ru; choice persisted; browser-default
- [ ] Hebrew UI = full RTL (mirrored layout, not just text)
- [ ] All user-facing strings localized (no hardcoded text)
- [ ] StructuredViewer styled, element-highlight, XSS-safe; schemaVersion branch
- [ ] Responsive on mobile; a11y basics (contrast/focus/aria); build green
