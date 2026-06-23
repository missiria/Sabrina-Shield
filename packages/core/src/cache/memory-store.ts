import type {
  RateLimitStore,
  KeyValueStore,
  CounterState,
  BucketParams,
  BucketState,
} from '../interfaces/store';
import { computeDrip, type BucketRecord } from './bucket-math';

interface CounterEntry {
  count: number;
  resetAt: number;
}
interface BucketEntry {
  record: BucketRecord;
  expiresAt: number;
}
interface KvEntry {
  value: unknown;
  expiresAt: number; // Infinity = no expiry
}

/**
 * In-memory implementation of {@link RateLimitStore} and {@link KeyValueStore}.
 *
 * Atomic by virtue of Node's single-threaded event loop: each method runs to
 * completion without interleaving. Suitable for single-instance deployments and
 * tests; use `@eksneks/redis` for distributed setups. TTL is enforced
 * lazily on access plus an optional periodic sweep.
 */
export class MemoryStore implements RateLimitStore, KeyValueStore {
  private readonly counters = new Map<string, CounterEntry>();
  private readonly buckets = new Map<string, BucketEntry>();
  private readonly kv = new Map<string, KvEntry>();
  private readonly sweeper?: ReturnType<typeof setInterval>;

  constructor(options: { sweepIntervalMs?: number } = {}) {
    const interval = options.sweepIntervalMs ?? 0;
    if (interval > 0) {
      this.sweeper = setInterval(() => this.sweep(Date.now()), interval);
      // Do not keep the process alive solely for the sweeper.
      this.sweeper.unref?.();
    }
  }

  async hit(key: string, windowMs: number, cost: number, nowMs: number): Promise<CounterState> {
    const existing = this.counters.get(key);
    if (!existing || existing.resetAt <= nowMs) {
      const entry: CounterEntry = { count: cost, resetAt: nowMs + windowMs };
      this.counters.set(key, entry);
      return { count: entry.count, resetAt: entry.resetAt };
    }
    existing.count += cost;
    return { count: existing.count, resetAt: existing.resetAt };
  }

  async read(key: string, nowMs: number): Promise<number> {
    const existing = this.counters.get(key);
    if (!existing || existing.resetAt <= nowMs) return 0;
    return existing.count;
  }

  async drip(key: string, params: BucketParams): Promise<BucketState> {
    const existing = this.buckets.get(key);
    const prev = existing && existing.expiresAt > params.nowMs ? existing.record : null;
    const outcome = computeDrip(prev, params);
    this.buckets.set(key, {
      record: outcome.record,
      expiresAt: params.nowMs + outcome.ttlMs,
    });
    return outcome.state;
  }

  async reset(key: string): Promise<void> {
    this.counters.delete(key);
    this.buckets.delete(key);
    this.kv.delete(key);
  }

  // --- KeyValueStore ---

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.kv.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.kv.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.kv.set(key, {
      value,
      expiresAt: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : Number.POSITIVE_INFINITY,
    });
  }

  async delete(key: string): Promise<void> {
    this.kv.delete(key);
  }

  async increment(key: string, amount = 1, ttlMs?: number): Promise<number> {
    const now = Date.now();
    const entry = this.kv.get(key);
    if (!entry || entry.expiresAt <= now) {
      const value = amount;
      this.kv.set(key, {
        value,
        expiresAt: ttlMs && ttlMs > 0 ? now + ttlMs : Number.POSITIVE_INFINITY,
      });
      return value;
    }
    const next = (typeof entry.value === 'number' ? entry.value : 0) + amount;
    entry.value = next;
    return next;
  }

  /** Remove expired entries. Called by the optional sweeper. */
  sweep(nowMs: number): void {
    for (const [key, entry] of this.counters) {
      if (entry.resetAt <= nowMs) this.counters.delete(key);
    }
    for (const [key, entry] of this.buckets) {
      if (entry.expiresAt <= nowMs) this.buckets.delete(key);
    }
    for (const [key, entry] of this.kv) {
      if (entry.expiresAt <= nowMs) this.kv.delete(key);
    }
  }

  /** Stop the background sweeper (if any). Call on shutdown. */
  destroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }
}
