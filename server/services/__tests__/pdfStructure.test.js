import { describe, it, expect } from 'vitest';
import { normalizeElements, structurePages } from '../pdfStructure.js';

describe('pdfStructure', () => {
  it('normalizeElements keeps valid, drops malformed', () => {
    const out = normalizeElements([
      { type: 'heading', level: 2, target: 'H' },
      { type: 'paragraph', target: 'P' },
      { type: 'list', ordered: true, items: [{ target: 'a' }, { nope: 1 }] },
      { type: 'table', rows: [[{ target: 'c' }]] },
      { type: 'bogus' }, null, { type: 'paragraph' /* no target */ },
    ]);
    expect(out.map((e) => e.type)).toEqual(['heading', 'paragraph', 'list', 'table']);
    expect(out[2].items).toEqual([{ source: '', target: 'a' }]);
  });

  it('structurePages parses valid LLM JSON and aggregates usage', async () => {
    const pages = [{ items: [{ x: 1, y: 1, str: 'shalom' }], width: 100, height: 100 }];
    const chatFn = async () => ({
      content: JSON.stringify({
        elements: [
          { type: 'heading', level: 1, source: 'א', target: 'Title' },
          { type: 'paragraph', source: 'ב', target: 'Body' },
        ],
      }),
      usage: { model: 'groq', promptTokens: 10, completionTokens: 5, totalTokens: 15, costUsd: 0.001 },
    });
    const { elements, usage } = await structurePages(pages, 'he', 'en', chatFn);
    expect(elements.map((e) => e.type)).toEqual(['heading', 'paragraph']);
    expect(usage.totals.total).toBe(15);
  });

  it('structurePages degrades to a paragraph on malformed JSON', async () => {
    const pages = [{ items: [{ x: 1, y: 1, str: 'plain text here' }], width: 100, height: 100 }];
    const chatFn = async () => ({ content: 'not json', usage: null });
    const { elements } = await structurePages(pages, 'he', 'en', chatFn);
    expect(elements).toEqual([{ type: 'paragraph', source: 'plain text here', target: 'plain text here' }]);
  });
});
