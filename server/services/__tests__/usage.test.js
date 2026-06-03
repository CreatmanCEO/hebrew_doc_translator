import { describe, it, expect } from 'vitest';
import { newUsage, addCall, finalize } from '../usage.js';

describe('usage aggregator', () => {
  it('accumulates across calls of same and different models', () => {
    const u = newUsage();
    addCall(u, { model:'gemini/gemini-2.0-flash', promptTokens:100, completionTokens:40, totalTokens:140, costUsd:0.001 });
    addCall(u, { model:'gemini/gemini-2.0-flash', promptTokens:50,  completionTokens:10, totalTokens:60,  costUsd:0.0005 });
    addCall(u, { model:'openrouter/anthropic/claude-sonnet-4', promptTokens:20, completionTokens:5, totalTokens:25, costUsd:0.01 });
    expect(u.byModel['gemini/gemini-2.0-flash']).toEqual({ calls:2, in:150, out:50, total:200, costUsd:0.0015 });
    expect(u.byModel['openrouter/anthropic/claude-sonnet-4'].calls).toBe(1);
    expect(u.totals).toEqual({ calls:3, in:170, out:55, total:225, costUsd:0.0115 });
  });

  it('handles missing fields gracefully', () => {
    const u = newUsage();
    addCall(u, {});
    expect(u.byModel['unknown'].calls).toBe(1);
    expect(u.totals.total).toBe(0);
  });

  it('finalize stamps owner/jobId/ts', () => {
    const u = finalize(newUsage(), { owner:'anon', jobId:'1', ts: 123 });
    expect(u.owner).toBe('anon'); expect(u.jobId).toBe('1'); expect(u.ts).toBe(123);
  });

  it('finalize defaults owner to anon', () => {
    expect(finalize(newUsage(), {}).owner).toBe('anon');
  });
});
