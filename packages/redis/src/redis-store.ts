import type { Redis } from 'ioredis';
import type {
  RateLimitStore,
  KeyValueStore,
  CounterState,
  BucketParams,
  BucketState,
} from '@eksneks/core';

export interface RedisStoreOptions {
  /** Prefix applied to every key (default `ss:`). */
  keyPrefix?: string;
}

// Atomic windowed increment: INCRBY then set expiry only on first write.
const HIT_SCRIPT = `
local c = redis.call('INCRBY', KEYS[1], ARGV[1])
if c == tonumber(ARGV[1]) then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
local pttl = redis.call('PTTL', KEYS[1])
return {c, pttl}
`;

// Atomic token-bucket drip. Mirrors core computeDrip().
const DRIP_SCRIPT = `
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refill)
local allowed = 0
local retry = -1
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
  retry = 0
else
  local deficit = cost - tokens
  if refill > 0 then retry = math.ceil(deficit / refill) end
end
local missing = capacity - tokens
local fullIn = -1
if refill > 0 then fullIn = math.ceil(missing / refill) end
redis.call('HMSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
if fullIn > 0 then redis.call('PEXPIRE', KEYS[1], fullIn) end
return {allowed, math.floor(tokens), retry, fullIn}
`;

// Atomic KV increment with optional first-write expiry.
const INCR_SCRIPT = `
local c = redis.call('INCRBY', KEYS[1], ARGV[1])
if c == tonumber(ARGV[1]) and tonumber(ARGV[2]) > 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return c
`;

/**
 * Distributed {@link RateLimitStore} + {@link KeyValueStore} backed by Redis.
 *
 * All multi-step operations run as Lua scripts so they are atomic across
 * instances. The caller injects a configured `ioredis` client; this class never
 * opens or owns the connection.
 */
export class RedisStore implements RateLimitStore, KeyValueStore {
  private readonly prefix: string;

  constructor(
    private readonly redis: Redis,
    options: RedisStoreOptions = {},
  ) {
    this.prefix = options.keyPrefix ?? 'ss:';
  }

  private k(key: string): string {
    return this.prefix + key;
  }

  async hit(key: string, windowMs: number, cost: number, nowMs: number): Promise<CounterState> {
    const [count, pttl] = (await this.redis.eval(
      HIT_SCRIPT,
      1,
      this.k(key),
      String(cost),
      String(windowMs),
    )) as [number, number];
    const ttl = pttl >= 0 ? pttl : windowMs;
    return { count, resetAt: nowMs + ttl };
  }

  async read(key: string, _nowMs: number): Promise<number> {
    const raw = await this.redis.get(this.k(key));
    return raw ? Number(raw) : 0;
  }

  async drip(key: string, params: BucketParams): Promise<BucketState> {
    const [allowed, remaining, retry, fullIn] = (await this.redis.eval(
      DRIP_SCRIPT,
      1,
      this.k(key),
      String(params.capacity),
      String(params.refillPerMs),
      String(params.cost),
      String(params.nowMs),
    )) as [number, number, number, number];
    return {
      allowed: allowed === 1,
      remaining,
      retryAfterMs: retry < 0 ? Number.POSITIVE_INFINITY : retry,
      resetAt: fullIn < 0 ? Number.POSITIVE_INFINITY : params.nowMs + fullIn,
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.k(key));
  }

  // --- KeyValueStore ---

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.k(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlMs && ttlMs > 0) {
      await this.redis.set(this.k(key), payload, 'PX', ttlMs);
    } else {
      await this.redis.set(this.k(key), payload);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.k(key));
  }

  async increment(key: string, amount = 1, ttlMs?: number): Promise<number> {
    return (await this.redis.eval(
      INCR_SCRIPT,
      1,
      this.k(key),
      String(amount),
      String(ttlMs ?? 0),
    )) as number;
  }
}
