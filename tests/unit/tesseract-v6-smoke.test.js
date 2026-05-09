/**
 * Smoke-тест для tesseract.js@^6 (P0-T06).
 *
 * Цель: подтвердить, что v6 API совместим с нашим использованием
 * (createWorker / recognize) и что иврит-traineddata загружается без ошибок.
 *
 * Полный OCR-прогон с реальной загрузкой языкового пака слишком тяжёл
 * для CI (сетевой download ~10 МБ + 30+ сек), поэтому запускается
 * только при HDT_RUN_OCR_SMOKE=1.
 *
 * Без флага проверяем только API surface — этого достаточно для
 * подтверждения того, что v6→v5 breaking changes не задели
 * наши call-sites (которых в коде сейчас нет; будут в P1-T03).
 */

const tesseract = require('tesseract.js');

describe('tesseract.js v6 — API surface', () => {
  it('экспортирует createWorker, recognize, PSM, OEM', () => {
    expect(typeof tesseract.createWorker).toBe('function');
    expect(typeof tesseract.recognize).toBe('function');
    expect(tesseract.PSM).toBeTypeOf('object');
    expect(tesseract.OEM).toBeTypeOf('object');
  });

  it('версия пакета >= 6 (загружена корректная major-line)', () => {
    // tesseract.js не экспортирует свою версию из main entry;
    // читаем из package.json — единственный надёжный путь.
    const pkg = require('tesseract.js/package.json');
    const major = parseInt(pkg.version.split('.')[0], 10);
    expect(major).toBeGreaterThanOrEqual(6);
  });
});

const SHOULD_RUN_REAL_OCR = process.env.HDT_RUN_OCR_SMOKE === '1';
const realOcrSuite = SHOULD_RUN_REAL_OCR ? describe : describe.skip;

realOcrSuite('tesseract.js v6 — реальное распознавание иврита', () => {
  it(
    'распознаёт ивритский фрагмент с confidence > 0.5',
    async () => {
      const sharp = require('sharp');
      // Простой SVG с ивритским словом "שלום" (shalom) — крупный шрифт,
      // высокий контраст, без шума: достаточно для OCR confidence > 0.5.
      const svg = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="120">
          <rect width="100%" height="100%" fill="white"/>
          <text x="50%" y="55%" font-family="DejaVu Sans, Arial, sans-serif"
                font-size="72" text-anchor="middle"
                dominant-baseline="middle" fill="black">שלום</text>
        </svg>
      `);
      const png = await sharp(svg).png().toBuffer();

      const worker = await tesseract.createWorker('heb');
      try {
        const { data } = await worker.recognize(png);
        // tesseract.js возвращает confidence в шкале 0..100.
        const normalised = data.confidence > 1 ? data.confidence / 100 : data.confidence;
        expect(normalised).toBeGreaterThan(0.5);
        // Текст должен содержать ивритские символы (диапазон U+0590..U+05FF).
        expect(data.text).toMatch(/[֐-׿]/);
      } finally {
        await worker.terminate();
      }
    },
    120_000,
  );
});
