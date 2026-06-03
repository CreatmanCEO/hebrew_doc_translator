import { describe, it, expect } from 'vitest';
import { validateAlign } from '../align.js';

const src = ['a', 'b'], tgt = ['x', 'y'];

describe('validateAlign', () => {
  it('keeps valid pairs', () => {
    expect(validateAlign([{ src: [0], tgt: [0] }, { src: [1], tgt: [1] }], src, tgt))
      .toEqual([{ src: [0], tgt: [0] }, { src: [1], tgt: [1] }]);
  });
  it('drops out-of-range groups, returns [] not throw', () => {
    expect(validateAlign([{ src: [5], tgt: [0] }], src, tgt)).toEqual([]);
    expect(validateAlign([{ src: [0], tgt: [9] }], src, tgt)).toEqual([]);
  });
  it('returns [] for malformed input', () => {
    expect(validateAlign(null, src, tgt)).toEqual([]);
    expect(validateAlign('nope', src, tgt)).toEqual([]);
    expect(validateAlign([{ src: 'x', tgt: [0] }], src, tgt)).toEqual([]);
    expect(validateAlign([{}], src, tgt)).toEqual([]);
  });
  it('keeps valid groups and drops invalid ones in the same array', () => {
    expect(validateAlign([{ src: [0], tgt: [0] }, { src: [9], tgt: [0] }], src, tgt))
      .toEqual([{ src: [0], tgt: [0] }]);
  });
  it('drops non-integer indices', () => {
    expect(validateAlign([{ src: [0.5], tgt: [0] }], src, tgt)).toEqual([]);
  });
});
