import { describe, it, expect } from 'vitest';
import * as docx from 'docx';
import { extractParagraphs, writeBack } from '../docxInplace.js';
import { buildSegments } from '../translationDocument.js';
import { buildTranslationDocument } from '../pipeline.js';

async function makeDocx(paras) {
  const d = new docx.Document({ sections: [{ children: paras.map(t =>
    new docx.Paragraph({ children: [ new docx.TextRun(t) ] })) }] });
  return docx.Packer.toBuffer(d);
}

// fake batch: uppercases each segment's source
const fakeBatch = async (chunk) => ({ items: chunk.map(s => ({ id: s.id, target: s.source.toUpperCase(), align: [] })), usage: null });

describe('docx in-place integration', () => {
  it('end-to-end docx in-place with a fake translator', async () => {
    const buf = await makeDocx(['hello world', 'second line']);
    const { paragraphs, zip, documentXml } = await extractParagraphs(buf);
    const blocks = paragraphs.map(p => ({ type: 'paragraph', content: p.content }));
    const { blocks: docBlocks, segments } = buildSegments(blocks);
    expect(docBlocks.length).toBe(paragraphs.length);
    const doc = await buildTranslationDocument({ blocks: docBlocks, segments }, fakeBatch, { sourceLang: 'he', targetLang: 'en' });
    const mapping = {};
    docBlocks.forEach((b, i) => { mapping[paragraphs[i].pIndex] = b.sentences.map(s => s.target).join(' '); });
    const out = await writeBack(zip, documentXml, mapping);
    const texts = (await extractParagraphs(out)).paragraphs.map(p => p.content);
    expect(texts).toEqual(['HELLO WORLD', 'SECOND LINE']);
  });
});
