import { describe, it, expect } from 'vitest';
import * as docx from 'docx'; // docx ships ESM named exports (no default) under vitest
import { extractParagraphs } from '../docxInplace.js';

async function makeDocx(paras) {
  const d = new docx.Document({
    sections: [
      {
        children: paras.map(
          (t) => new docx.Paragraph({ children: [new docx.TextRun(t)] })
        ),
      },
    ],
  });
  return docx.Packer.toBuffer(d);
}

describe('extractParagraphs', () => {
  it('extracts non-empty paragraphs with pIndex and content', async () => {
    const buf = await makeDocx(['שלום עולם', '', 'Second para']);
    const { paragraphs, documentXml } = await extractParagraphs(buf);
    expect(paragraphs.length).toBe(2); // the empty paragraph is skipped
    expect(paragraphs[0].content).toBe('שלום עולם');
    expect(typeof paragraphs[0].pIndex).toBe('number');
    expect(documentXml).toContain('w:p');
  });

  it('rejects DOCTYPE (XXE guard)', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('word/document.xml', '<?xml version="1.0"?><!DOCTYPE x><w:document/>');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(extractParagraphs(buf)).rejects.toThrow(/DOCTYPE|entity|XXE/i);
  });
});
