import { describe, it, expect } from 'vitest';
import { buildSegments, SCHEMA_VERSION } from '../translationDocument.js';

describe('translationDocument', () => {
  it('builds blocks->sentences with ids and srcTokens', () => {
    const blocks = [
      { type: 'text', content: 'שלום עולם. מה שלומך?' },
      { type: 'text', content: 'Single line' },
    ];
    const { blocks: out, segments } = buildSegments(blocks);
    expect(out.length).toBe(2);
    expect(out[0].id).toBe('b0');
    expect(out[0].sentences.length).toBe(2);            // two Hebrew sentences
    expect(out[0].sentences[0].id).toBe('b0s0');
    expect(out[0].sentences[0].srcTokens.length).toBeGreaterThan(0);
    expect(out[1].sentences[0].id).toBe('b1s0');
    // flat segments references same objects
    expect(segments.length).toBe(3);
    expect(segments[0]).toBe(out[0].sentences[0]);
  });

  it('skips empty blocks', () => {
    const { blocks } = buildSegments([{ type: 'text', content: '   ' }, { type: 'text', content: 'Hi.' }]);
    expect(blocks.length).toBe(1);
    expect(blocks[0].id).toBe('b1'); // index preserved from original position
  });

  it('exports SCHEMA_VERSION', () => { expect(SCHEMA_VERSION).toBe(1); });
});
