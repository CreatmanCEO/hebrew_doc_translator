import { describe, it, expect } from 'vitest';
import { toPdfRect, wrapAndFit } from '../pdfOverlay.js';

describe('toPdfRect', () => {
  it('converts top-left bbox to pdf bottom-left', () => {
    expect(toPdfRect({ x: 10, y: 20, w: 30, h: 8 }, 100)).toEqual({ x: 10, y: 72, w: 30, h: 8 });
  });
});

describe('wrapAndFit', () => {
  it('wraps and fits within the box', () => {
    const measure = (s, size) => s.length * size * 0.5; // fake metric
    const r = wrapAndFit('aaaa bbbb cccc dddd', 40, 100, measure, { max: 12, min: 6 });
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.size).toBeLessThanOrEqual(12);
    expect(r.size).toBeGreaterThanOrEqual(6);
    // every line fits the width at the chosen size
    r.lines.forEach((line) => expect(measure(line, r.size)).toBeLessThanOrEqual(40 + 1e-9));
  });

  it('falls back to min size on a tiny box (overflow, no crash)', () => {
    const measure = (s, size) => s.length * size;
    const r = wrapAndFit('verylongword', 5, 5, measure, { max: 12, min: 6 });
    expect(r.size).toBe(6);
    expect(Array.isArray(r.lines)).toBe(true);
    expect(r.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('empty text -> no lines', () => {
    const r = wrapAndFit('   ', 40, 100, (s, sz) => s.length * sz, { max: 12, min: 6 });
    expect(r.lines).toEqual([]);
  });
});
