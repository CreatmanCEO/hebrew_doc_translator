'use strict';

/**
 * Per-job usage / cost aggregator.
 *
 * Phase 1 captures token usage + cost per LLM batch call (see
 * `LiteLLMProvider.translateBatchAligned`, which returns a `usage` object of the
 * shape `{ model, promptTokens, completionTokens, totalTokens, costUsd }`).
 *
 * This module folds many such per-call usages into a per-document total,
 * grouped by the actual model used, and stamps owner / job metadata so a future
 * per-user admin panel can attribute spend.
 *
 * No clock is read here: `finalize` takes `ts` as input so callers stay
 * deterministic and testable.
 */

/** Shape of a fresh per-bucket accumulator. */
function emptyBucket() {
  return { calls: 0, in: 0, out: 0, total: 0, costUsd: 0 };
}

/** Create an empty usage accumulator. */
function newUsage() {
  return { byModel: {}, totals: emptyBucket() };
}

/** Coerce a possibly-missing numeric field to a finite number, else 0. */
function num(v) {
  return Number.isFinite(v) ? v : 0;
}

/**
 * Accumulate a single per-call usage record into `usage`.
 * Missing fields are treated as 0; a missing model is bucketed as 'unknown'.
 * Mutates and returns `usage`.
 *
 * @param {{byModel: object, totals: object}} usage
 * @param {{model?: string, promptTokens?: number, completionTokens?: number, totalTokens?: number, costUsd?: number}} call
 */
function addCall(usage, call) {
  const c = call || {};
  const model = c.model || 'unknown';
  const inTok = num(c.promptTokens);
  const outTok = num(c.completionTokens);
  const totalTok = num(c.totalTokens);
  const cost = num(c.costUsd);

  if (!usage.byModel[model]) usage.byModel[model] = emptyBucket();

  for (const bucket of [usage.byModel[model], usage.totals]) {
    bucket.calls += 1;
    bucket.in += inTok;
    bucket.out += outTok;
    bucket.total += totalTok;
    bucket.costUsd += cost;
  }

  return usage;
}

/**
 * Stamp owner / job metadata onto a usage object and return a shallow copy.
 * `ts` is passed in (never read from a clock here) for testability.
 *
 * @param {{byModel: object, totals: object}} usage
 * @param {{owner?: string, jobId?: string|number|null, ts?: number|null}} meta
 */
function finalize(usage, meta) {
  const m = meta || {};
  return {
    ...usage,
    owner: m.owner ?? 'anon',
    jobId: m.jobId ?? null,
    ts: m.ts ?? null,
  };
}

module.exports = { newUsage, addCall, finalize };
