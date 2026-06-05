import { describe, it, expect } from 'vitest';
import { renderStructuredDocx } from '../structuredDocx.js';
import { extractParagraphs } from '../docxInplace.js';

describe('renderStructuredDocx', () => {
  it('renders headings/paragraphs/lists/tables to a valid docx', async () => {
    const sd = { schemaVersion:2, sourceLang:'he', targetLang:'en', elements:[
      { type:'heading', level:1, source:'כותרת', target:'Title' },
      { type:'paragraph', source:'פסקה', target:'A paragraph' },
      { type:'list', ordered:false, items:[{source:'א',target:'Apple'},{source:'ב',target:'Banana'}] },
      { type:'table', rows:[[{source:'ש',target:'Name'},{source:'ג',target:'Age'}],[{source:'x',target:'Bob'},{source:'y',target:'30'}]] },
    ]};
    const buf = await renderStructuredDocx(sd);
    expect(Buffer.isBuffer(buf)).toBe(true);
    const texts = (await extractParagraphs(buf)).paragraphs.map(p=>p.content).join(' ');
    expect(texts).toContain('Title');
    expect(texts).toContain('A paragraph');
    expect(texts).toContain('Apple');
    expect(texts).toContain('Banana');
    expect(texts).toContain('Name');     // table header cell
    expect(texts).toContain('Bob');      // table body cell
  });

  it('skips unknown element types without crashing', async () => {
    const buf = await renderStructuredDocx({ elements:[ {type:'bogus'}, {type:'paragraph', target:'ok'} ] });
    const texts = (await extractParagraphs(buf)).paragraphs.map(p=>p.content).join(' ');
    expect(texts).toContain('ok');
  });
});
