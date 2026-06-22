/** Final decision an algorithm reports to callers. */
export interface RateLimitResult {
  /** Whether the request is allowed (limit not exceeded). */
  allowed: boolean;
  /** Maximum hits permitted in the window. */
  limit: number;
  /** Hits/tokens remaining (never negative). */
  remaining: number;
  /** Epoch milliseconds at which the window/quota resets. */
  resetAt: number;
  /** Milliseconds to wait before retrying (0 when allowed). */
  retryAfterMs: number;
}

/** State of a windowed counter after a mutation. */
export interface CounterState {
  count: number;
  /** Epoch milliseconds when the window expires. */
  resetAt: number;
}

/** Parameters for a token/leaky bucket "drip" operation. */
export interface BucketParams {
  /** Maximum tokens the bucket holds. */
  capacity: number;
  /** Tokens replenished per millisecond. */
  refillPerMs: number;
  /** Tokens this request consumes. */
  cost: number;
  /** Current time in epoch milliseconds. */
  nowMs: number;
}

/** State of a bucket after a drip. */
export interface BucketState {
  allowed: boolean;
  /** Whole tokens left after the operation. */
  remaining: number;
  /** Milliseconds until enough tokens accrue (0 when allowed). */
  retryAfterMs: number;
  /** Epoch milliseconds when the bucket is full again. */
  resetAt: number;
}

/**
 * Pluggable backing store for rate limiting.
 *
 * Exposes the three atomic primitives the rate-limit algorithms build on:
 * windowed {@link increment}/{@link read} (fixed & sliding window) and
 * {@link drip} (token & leaky bucket). Atomicity lives in the store —
 * `MemoryStore` is atomic by virtue of the single-threaded event loop;
 * `RedisStore` uses Lua scripts. Any user store (Mongo, Postgres, DynamoDB)
 * implements this contract.
 */
export interface RateLimitStore {
  /** Atomically add `cost` to a windowed counter that expires after `windowMs`. */
  hit(key: string, windowMs: number, cost: number, nowMs: number): Promise<CounterState>;
  /** Read the current value of a windowed counter (0 if absent/expired). */
  read(key: string, nowMs: number): Promise<number>;
  /** Atomically refill then consume from a token/leaky bucket. */
  drip(key: string, params: BucketParams): Promise<BucketState>;
  /** Clear all state for `key`. */
  reset(key: string): Promise<void>;
}

/**
 * Generic key/value store with TTL, used by IP blocklist and abuse counters.
 * Separate from {@link RateLimitStore} so simple backends can implement one
 * without the other.
 */
export interface KeyValueStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Atomically increment a numeric counter, returning the new value. */
  increment(key: string, amount?: number, ttlMs?: number): Promise<number>;
}
