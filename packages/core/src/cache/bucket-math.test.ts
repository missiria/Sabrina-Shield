import { describe, it, expect } from 'vitest';
import { computeDrip } from './bucket-math';

const params = (over: Partial<Parameters<typeof computeDrip>[1]> = {}) => ({
  capacity: 10,
  refillPerMs: 10 / 1000, // 10 tokens per second
  cost: 1,
  nowMs: 0,
  ...over,
});

describe('computeDrip', () => {
  it('starts with a full bucket and consumes cost', () => {
    const out = computeDrip(null, params());
    expect(out.state.allowed).toBe(true);
    expect(out.state.remaining).toBe(9);
    expect(out.record.tokens).toBeCloseTo(9);
  });

  it('blocks when empty and reports retryAfter', () => {
    const rec = computeDrip(null, params({ cost: 10 })).record; // drain to 0
    const out = computeDrip(rec, params({ cost: 1, nowMs: 0 }));
    expect(out.state.allowed).toBe(false);
    expect(out.state.remaining).toBe(0);
    // need 1 token at 0.01 tokens/ms => 100ms
    expect(out.state.retryAfterMs).toBe(100);
  });

  it('refills over time up to capacity', () => {
    const drained = computeDrip(null, params({ cost: 10 })).record;
    // 500ms later => +5 tokens
    const out = computeDrip(drained, params({ cost: 0, nowMs: 500 }));
    expect(out.record.tokens).toBeCloseTo(5);
    // far future caps at capacity
    const full = computeDrip(drained, params({ cost: 0, nowMs: 10_000 }));
    expect(full.record.tokens).toBe(10);
  });

  it('handles zero refill rate gracefully', () => {
    const drained = computeDrip(null, params({ cost: 10 })).record;
    const out = computeDrip(drained, params({ cost: 1, refillPerMs: 0, nowMs: 1000 }));
    expect(out.state.allowed).toBe(false);
    expect(out.state.retryAfterMs).toBe(Number.POSITIVE_INFINITY);
  });
});
