import { describe, it, expect } from 'vitest';
import { structurePages } from '../pdfStructure.js';
import { renderStructuredDocx } from '../structuredDocx.js';
import { extractParagraphs } from '../docxInplace.js';

it('structurePages(fake LLM) -> renderStructuredDocx -> valid docx with translated text', async () => {
  const pages = [{ items:[{x:1,y:1,str:'shalom'}], width:100, height:100 }];
  const chatFn = async () => ({ content: JSON.stringify({ elements:[
    { type:'heading', level:1, source:'א', target:'Title' },
    { type:'paragraph', source:'ב', target:'Hello body' },
    { type:'list', ordered:true, items:[{source:'x',target:'First'},{source:'y',target:'Second'}] },
  ]}), usage:null });
  const { elements } = await structurePages(pages, 'he','en', chatFn);
  const buf = await renderStructuredDocx({ schemaVersion:2, sourceLang:'he', targetLang:'en', elements });
  const text = (await extractParagraphs(buf)).paragraphs.map(p=>p.content).join(' ');
  expect(text).toContain('Title');
  expect(text).toContain('Hello body');
  expect(text).toContain('First');
});
