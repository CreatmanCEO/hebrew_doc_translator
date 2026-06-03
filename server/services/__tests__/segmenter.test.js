import { describe, it, expect } from 'vitest';
import { splitSentences, tokenize, nfc } from '../segmenter.js';

describe('segmenter', () => {
  it('splits into sentences', () => {
    const s = splitSentences('Hello world. How are you? Fine.');
    expect(s.length).toBe(3);
  });
  it('tokenizes on whitespace, drops empties', () => {
    expect(tokenize('  שלום   עולם ')).toEqual(['שלום', 'עולם']);
  });
  it('nfc-normalizes', () => {
    // decomposed e + combining acute -> precomposed é
    expect(nfc('é')).toBe('é');
  });
  it('splitSentences returns [] for empty/whitespace', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});
