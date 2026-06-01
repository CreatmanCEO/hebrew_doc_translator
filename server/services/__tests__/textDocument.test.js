import { describe, it, expect } from 'vitest';
import { toBlocks, renderText } from '../textDocument.js';

describe('textDocument', () => {
  it('splits text into paragraph blocks, drops empties, marks non-empty translatable', () => {
    const blocks = toBlocks('שלום\n\nworld\n\n  ');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'text', content: 'שלום', needsTranslation: true });
  });

  it('renderText joins translated block contents with blank lines', () => {
    expect(renderText([{ content: 'hello' }, { content: 'world' }])).toBe('hello\n\nworld');
  });
});
