import { describe, it, expect } from 'vitest';
import { groupBlocks } from '../pdfOverlay.js';

const it_ = (x, y, w, h, str) => ({ x, y, width: w, height: h, str });

describe('groupBlocks', () => {
  it('groups items into lines and blocks', () => {
    const items = [
      it_(50, 100, 20, 10, 'Hello'), it_(75, 100, 20, 10, 'world'),  // line 1
      it_(50, 112, 30, 10, 'second'),                                 // line 2, same block (small gap)
      it_(50, 200, 30, 10, 'far'),                                    // line 3, new block (big gap)
    ];
    const blocks = groupBlocks(items, { yTol: 3, blockGapFactor: 1.6 });
    expect(blocks.length).toBe(2);
    expect(blocks[0].content).toBe('Hello world second');
    expect(blocks[1].content).toBe('far');
    expect(blocks[0].bbox.x).toBe(50);
  });

  it('drops empty items', () => {
    expect(groupBlocks([it_(0, 0, 5, 5, '   '), it_(0, 0, 5, 5, 'x')]).length).toBe(1);
  });
});
