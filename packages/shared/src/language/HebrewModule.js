// @hdt/shared/language/HebrewModule — MVP-имплементация LanguageModule для иврита.
// Контракт описан в ARCHITECTURE.md §3.2. В Phase 0 заполняем только обязательные
// поля + детектор; transliterator/preprocess/cloudVisionHint/ocrLangPack будут
// доуточнены вместе с реальными OCR/LLM-провайдерами в P1/P2.

/**
 * Диапазон Unicode для еврейского письма:
 * - U+0590..U+05FF — Hebrew (буквы, никудот, кантилляция, пунктуация)
 * - U+FB1D..U+FB4F — Hebrew Presentation Forms (лигатуры, опционально)
 * Используется и в детекторе, и (в будущем) в preprocess для очистки кантилляции.
 */
const HEBREW_CHAR_RE = /[֐-׿יִ-ﭏ]/g;
// Не-пробельный символ в любом юникод-блоке — знаменатель для расчёта confidence.
const NON_WHITESPACE_RE = /\S/g;

/**
 * Детектор языка для иврита.
 * Возвращает confidence ∈ [0, 1] = доля ивритских символов от всех
 * не-пробельных символов в тексте. Пустая или whitespace-only строка → 0.
 *
 * Это намеренно простая character-range эвристика (без franc):
 * - дёшево, синхронно, без сетевых/IO зависимостей;
 * - работает корректно на смешанных документах (он же confidence,
 *   а не binary-флаг — registry агрегирует и выбирает максимум);
 * - устойчив к коротким фразам, на которых franc часто промахивается.
 *
 * @param {string} text
 * @returns {number} confidence в диапазоне 0..1
 */
function detector(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  const nonWs = text.match(NON_WHITESPACE_RE);
  if (!nonWs || nonWs.length === 0) return 0;
  const hebChars = text.match(HEBREW_CHAR_RE);
  if (!hebChars) return 0;
  return hebChars.length / nonWs.length;
}

/**
 * @type {import('./LanguageModule').LanguageModule}
 */
const HebrewModule = {
  code: 'he',
  direction: 'rtl',
  shapingRequired: false, // в иврите glyph-shaping не нужен (в отличие от арабского/фарси)
  ocrLangPack: 'heb', // tesseract.js
  cloudVisionHint: 'iw', // Google Vision использует устаревший ISO 639-1 для иврита
  fontFamily: {
    // Конкретные пути/имена будут уточнены в P1-T06/T07 при сборке Puppeteer-CSS;
    // сейчас держим имя CSS-семейства, доступное в стандартных дистрибутивах.
    regular: 'Noto Sans Hebrew',
  },
  detector,
};

module.exports = { HebrewModule, detector };
