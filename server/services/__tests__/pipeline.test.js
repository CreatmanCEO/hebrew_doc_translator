import { describe, it, expect } from 'vitest';
import { chunkSegments, buildTranslationDocument } from '../pipeline.js';

const seg = (id, toks) => ({ id, source: toks.join(' '), srcTokens: toks });

describe('chunkSegments', () => {
  it('splits by count', () => {
    const segs = Array.from({length:40}, (_,i)=>seg('s'+i, ['a']));
    const chunks = chunkSegments(segs, { maxPerChunk: 18, maxTokens: 9999 });
    expect(chunks.length).toBe(3); // 18,18,4
    expect(chunks[0].length).toBe(18);
  });
  it('splits by token budget', () => {
    const segs = [seg('a', Array(1000).fill('x')), seg('b', Array(1000).fill('y'))];
    const chunks = chunkSegments(segs, { maxPerChunk: 18, maxTokens: 1500 });
    expect(chunks.length).toBe(2);
  });
});

describe('buildTranslationDocument', () => {
  const fakeBatch = async (chunk) => ({
    items: chunk.map(s => ({ id: s.id, target: s.srcTokens.map(t=>t.toUpperCase()).join(' '), align: s.srcTokens.map((_,i)=>({src:[i],tgt:[i]})) })),
    usage: { model:'fake', promptTokens:10, completionTokens:5, totalTokens:15, costUsd:0.001 },
  });
  it('fills targets, tgtTokens, validated align; aggregates usage', async () => {
    const { blocks } = { blocks: [{ id:'b0', type:'paragraph', sentences:[ seg('b0s0',['ab','cd']) ] }] };
    const segments = blocks[0].sentences;
    const doc = await buildTranslationDocument({ blocks, segments }, fakeBatch, { sourceLang:'he', targetLang:'en' });
    const s = doc.blocks[0].sentences[0];
    expect(s.target).toBe('AB CD');
    expect(s.tgtTokens).toEqual(['AB','CD']);
    expect(s.align).toEqual([{src:[0],tgt:[0]},{src:[1],tgt:[1]}]);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.usage.totals.total).toBe(15);
    expect(doc.usage.owner).toBe('anon');
  });
  it('passes through untranslated when item missing', async () => {
    const emptyBatch = async () => ({ items: [], usage: null });
    const blocks = [{ id:'b0', type:'paragraph', sentences:[ seg('b0s0',['x']) ] }];
    const doc = await buildTranslationDocument({ blocks, segments: blocks[0].sentences }, emptyBatch, { sourceLang:'he', targetLang:'en' });
    expect(doc.blocks[0].sentences[0].target).toBe('x');
    expect(doc.blocks[0].sentences[0].align).toEqual([]);
  });
  it('applies segment cap and calls onCap', async () => {
    let capInfo = null;
    const blocks = [{ id:'b0', type:'paragraph', sentences: Array.from({length:5},(_,i)=>seg('b0s'+i,['w'])) }];
    const doc = await buildTranslationDocument({ blocks, segments: blocks[0].sentences }, fakeBatch,
      { sourceLang:'he', targetLang:'en', maxSegments: 3, onCap: (i)=>{capInfo=i;} });
    expect(capInfo).toEqual({ total:5, cap:3 });
    expect(doc.blocks[0].sentences[0].target).toBe('W');   // translated
    expect(doc.blocks[0].sentences[4].target).toBe('w');   // capped -> source
  });
  it('a failing chunk degrades to source passthrough, job still completes', async () => {
    const seg = (id, toks) => ({ id, source: toks.join(' '), srcTokens: toks });
    const blocks = [{ id:'b0', type:'paragraph', sentences:[ seg('b0s0',['a']), seg('b0s1',['b']) ] }];
    // force tiny chunks so each segment is its own chunk; first chunk throws, second ok
    let call = 0;
    const flakyBatch = async (chunk) => {
      call++;
      if (call === 1) throw new Error('groq timeout');
      return { items: chunk.map(s => ({ id:s.id, target:'OK', align:[] })), usage:null };
    };
    const doc = await buildTranslationDocument({ blocks, segments: blocks[0].sentences }, flakyBatch,
      { sourceLang:'he', targetLang:'en', maxPerChunk: 1, concurrency: 1 });
    const s = doc.blocks[0].sentences;
    // first segment failed -> source passthrough; second -> translated
    expect(s[0].target).toBe('a');
    expect(s[1].target).toBe('OK');
  });
});
