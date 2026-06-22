import type { BucketParams, BucketState } from '../interfaces/store';

/** Persisted token-bucket record. */
export interface BucketRecord {
  tokens: number;
  lastRefillMs: number;
}

export interface DripOutcome {
  state: BucketState;
  /** Record to persist after the operation. */
  record: BucketRecord;
  /** Suggested TTL for the record (time to fully refill from empty). */
  ttlMs: number;
}

/**
 * Pure token-bucket computation shared by every store implementation so memory
 * and Redis (Lua) stay behaviourally identical. A leaky-bucket meter is the
 * dual of a token bucket and is modelled with the same math.
 */
export function computeDrip(prev: BucketRecord | null, params: BucketParams): DripOutcome {
  const { capacity, refillPerMs, cost, nowMs } = params;

  // Start with a full bucket on first contact.
  let tokens = prev ? prev.tokens : capacity;
  const last = prev ? prev.lastRefillMs : nowMs;

  // Refill based on elapsed time, capped at capacity.
  const elapsed = Math.max(0, nowMs - last);
  tokens = Math.min(capacity, tokens + elapsed * refillPerMs);

  let allowed: boolean;
  let retryAfterMs: number;
  if (tokens >= cost) {
    tokens -= cost;
    allowed = true;
    retryAfterMs = 0;
  } else {
    allowed = false;
    const deficit = cost - tokens;
    retryAfterMs = refillPerMs > 0 ? Math.ceil(deficit / refillPerMs) : Number.POSITIVE_INFINITY;
  }

  const missing = capacity - tokens;
  const fullInMs = refillPerMs > 0 ? Math.ceil(missing / refillPerMs) : Number.POSITIVE_INFINITY;

  return {
    state: {
      allowed,
      remaining: Math.floor(tokens),
      retryAfterMs,
      resetAt: nowMs + fullInMs,
    },
    record: { tokens, lastRefillMs: nowMs },
    ttlMs: Number.isFinite(fullInMs) ? fullInMs : 0,
  };
}
