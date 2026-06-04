import { describe, it, expect } from 'vitest';
import { renderOverlay } from '../pdfOverlay.js';
import { PDFDocument } from 'pdf-lib';

async function makePdf() {
  const d = await PDFDocument.create();
  const p = d.addPage([200, 200]);
  p.drawText('original', { x: 20, y: 170, size: 12 });
  return Buffer.from(await d.save());
}

it('renders an overlay PDF that re-loads; page count preserved', async () => {
  const buf = await makePdf();
  const blocks = [{ page: 0, pageHeight: 200, bbox: { x: 20, y: 20, w: 160, h: 14 }, target: 'Привет мир' }];
  const out = await renderOverlay(buf, blocks);
  expect(Buffer.isBuffer(out)).toBe(true);
  const re = await PDFDocument.load(out);
  expect(re.getPageCount()).toBe(1);
  expect(out.length).toBeGreaterThan(0);
});

it('skips blocks without a string target without crashing', async () => {
  const buf = await makePdf();
  const out = await renderOverlay(buf, [{ page: 0, pageHeight: 200, bbox: { x: 0, y: 0, w: 10, h: 10 }, target: null }]);
  await expect(PDFDocument.load(out)).resolves.toBeTruthy();
});

it('ignores a block whose page index is out of range', async () => {
  const buf = await makePdf();
  const out = await renderOverlay(buf, [{ page: 5, pageHeight: 200, bbox: { x: 0, y: 0, w: 10, h: 10 }, target: 'x' }]);
  await expect(PDFDocument.load(out)).resolves.toBeTruthy();
});
