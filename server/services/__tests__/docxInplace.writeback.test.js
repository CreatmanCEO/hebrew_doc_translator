import { describe, it, expect } from 'vitest';
import * as docx from 'docx';
import { extractParagraphs, writeBack } from '../docxInplace.js';

async function makeDocx(paras) {
  const d = new docx.Document({ sections: [{ children: paras.map(t =>
    new docx.Paragraph({ children: [ new docx.TextRun(t) ] })) }] });
  return docx.Packer.toBuffer(d);
}

describe('writeBack', () => {
  it('writes translation into first run, blanks others, round-trips', async () => {
    const buf = await makeDocx(['שלום עולם', 'Keep me']);
    const { paragraphs, zip, documentXml } = await extractParagraphs(buf);
    const mapping = {}; mapping[paragraphs[0].pIndex] = 'Hello world';
    const out = await writeBack(zip, documentXml, mapping);
    expect(Buffer.isBuffer(out)).toBe(true);
    const re = await extractParagraphs(out);
    const texts = re.paragraphs.map(p => p.content);
    expect(texts).toContain('Hello world');   // translated paragraph replaced
    expect(texts).toContain('Keep me');       // untouched paragraph preserved
  });

  it('throws when a mapping target is not a string (caller will fall back)', async () => {
    const buf = await makeDocx(['a']);
    const { paragraphs, zip, documentXml } = await extractParagraphs(buf);
    const m = {}; m[paragraphs[0].pIndex] = { not: 'a string' };
    await expect(writeBack(zip, documentXml, m)).rejects.toThrow();
  });

  it('leaves paragraphs not in the mapping unchanged', async () => {
    const buf = await makeDocx(['one', 'two']);
    const { paragraphs, zip, documentXml } = await extractParagraphs(buf);
    const m = {}; m[paragraphs[1].pIndex] = 'TWO';
    const out = await writeBack(zip, documentXml, m);
    const texts = (await extractParagraphs(out)).paragraphs.map(p => p.content);
    expect(texts).toEqual(['one', 'TWO']);
  });
});
