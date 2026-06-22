import type { RateLimitResult, RateLimitStore } from '../interfaces/store';
import type { AlgorithmParams, RateLimitAlgorithm } from './types';

/**
 * Fixed window: a single counter per window. Simple and cheap, but allows up to
 * 2x bursts at window boundaries.
 */
export class FixedWindowAlgorithm implements RateLimitAlgorithm {
  readonly name = 'fixed-window' as const;

  async consume(store: RateLimitStore, key: string, p: AlgorithmParams): Promise<RateLimitResult> {
    const { count, resetAt } = await store.hit(key, p.windowMs, p.cost, p.nowMs);
    const allowed = count <= p.limit;
    return {
      allowed,
      limit: p.limit,
      remaining: Math.max(0, p.limit - count),
      resetAt,
      retryAfterMs: allowed ? 0 : Math.max(0, resetAt - p.nowMs),
    };
  }
}

/**
 * Sliding window (weighted): blends the current window's count with a decaying
 * fraction of the previous window's. Smooths the boundary-burst problem without
 * storing per-request timestamps.
 */
export class SlidingWindowAlgorithm implements RateLimitAlgorithm {
  readonly name = 'sliding-window' as const;

  async consume(store: RateLimitStore, key: string, p: AlgorithmParams): Promise<RateLimitResult> {
    const index = Math.floor(p.nowMs / p.windowMs);
    const windowStart = index * p.windowMs;
    const curKey = `${key}:${index}`;
    const prevKey = `${key}:${index - 1}`;

    // Keep counters for two windows so the previous one is still readable.
    const cur = await store.hit(curKey, p.windowMs * 2, p.cost, p.nowMs);
    const prevCount = await store.read(prevKey, p.nowMs);

    const elapsed = p.nowMs - windowStart;
    const weight = 1 - elapsed / p.windowMs;
    const estimated = prevCount * weight + cur.count;
    const allowed = estimated <= p.limit;
    const resetAt = windowStart + p.windowMs;

    return {
      allowed,
      limit: p.limit,
      remaining: Math.max(0, Math.floor(p.limit - estimated)),
      resetAt,
      retryAfterMs: allowed ? 0 : Math.max(0, resetAt - p.nowMs),
    };
  }
}

/**
 * Token bucket: tokens refill continuously up to a capacity; each request
 * spends `cost`. Allows controlled bursts up to the bucket capacity.
 */
export class TokenBucketAlgorithm implements RateLimitAlgorithm {
  readonly name = 'token-bucket' as const;

  async consume(store: RateLimitStore, key: string, p: AlgorithmParams): Promise<RateLimitResult> {
    const state = await store.drip(key, {
      capacity: p.limit,
      refillPerMs: p.limit / p.windowMs,
      cost: p.cost,
      nowMs: p.nowMs,
    });
    return {
      allowed: state.allowed,
      limit: p.limit,
      remaining: state.remaining,
      resetAt: state.resetAt,
      retryAfterMs: state.retryAfterMs,
    };
  }
}

/**
 * Leaky bucket (meter): requests fill a bucket that drains at a steady rate.
 * Mathematically the dual of the token bucket and shares the same drip
 * primitive, enforcing a smooth long-run rate of `max` per `window`.
 */
export class LeakyBucketAlgorithm implements RateLimitAlgorithm {
  readonly name = 'leaky-bucket' as const;

  async consume(store: RateLimitStore, key: string, p: AlgorithmParams): Promise<RateLimitResult> {
    const state = await store.drip(key, {
      capacity: p.limit,
      refillPerMs: p.limit / p.windowMs,
      cost: p.cost,
      nowMs: p.nowMs,
    });
    return {
      allowed: state.allowed,
      limit: p.limit,
      remaining: state.remaining,
      resetAt: state.resetAt,
      retryAfterMs: state.retryAfterMs,
    };
  }
}

/** Registry of built-in algorithms by name. */
export const ALGORITHMS: Record<string, RateLimitAlgorithm> = {
  'fixed-window': new FixedWindowAlgorithm(),
  'sliding-window': new SlidingWindowAlgorithm(),
  'token-bucket': new TokenBucketAlgorithm(),
  'leaky-bucket': new LeakyBucketAlgorithm(),
};
