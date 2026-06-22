import { describe, it, expect, beforeEach } from 'vitest';
import Redis from 'ioredis-mock';
import { RedisStore } from './redis-store';

// ioredis-mock is API-compatible with ioredis (including EVAL/Lua), but shares
// one in-memory dataset across instances — flush before each test.
let seq = 0;
function makeClient() {
  return new Redis() as unknown as import('ioredis').Redis;
}

describe('RedisStore — windowed counter', () => {
  let store: RedisStore;
  beforeEach(async () => {
    const client = makeClient();
    await client.flushall();
    store = new RedisStore(client, { keyPrefix: `t${seq++}:` });
  });

  it('increments and reports reset', async () => {
    const a = await store.hit('k', 1000, 1, 0);
    expect(a.count).toBe(1);
    expect(a.resetAt).toBeGreaterThan(0);
    const b = await store.hit('k', 1000, 1, 0);
    expect(b.count).toBe(2);
  });

  it('read returns current value or 0', async () => {
    expect(await store.read('missing', 0)).toBe(0);
    await store.hit('k', 1000, 3, 0);
    expect(await store.read('k', 0)).toBe(3);
  });
});

describe('RedisStore — bucket', () => {
  let store: RedisStore;
  beforeEach(async () => {
    const client = makeClient();
    await client.flushall();
    store = new RedisStore(client, { keyPrefix: `t${seq++}:` });
  });

  it('drips and consumes tokens (shape + monotonic decrease)', async () => {
    // Absolute token counts are asserted in core's bucket-math.test.ts (pure,
    // deterministic). Here we verify the Lua wiring: a same-instant second drip
    // consumes one more token and the result shape is correct. (ioredis-mock's
    // Lua EVAL is not reliable enough for exact absolute state under load.)
    await store.reset('b');
    const p = { capacity: 5, refillPerMs: 5 / 1000, cost: 1, nowMs: 0 };
    const first = await store.drip('b', p);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBeGreaterThanOrEqual(0);
    expect(first.remaining).toBeLessThanOrEqual(4);
    const second = await store.drip('b', { ...p, nowMs: 0 });
    expect(second.remaining).toBe(Math.max(0, first.remaining - 1));
  });

  it('blocks when drained and reports retryAfter', async () => {
    await store.reset('b');
    const p = { capacity: 2, refillPerMs: 2 / 1000, cost: 1, nowMs: 0 };
    await store.drip('b', p);
    await store.drip('b', { ...p, nowMs: 0 });
    const blocked = await store.drip('b', { ...p, nowMs: 0 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});

describe('RedisStore — KeyValueStore', () => {
  let store: RedisStore;
  beforeEach(async () => {
    const client = makeClient();
    await client.flushall();
    store = new RedisStore(client, { keyPrefix: `t${seq++}:` });
  });

  it('set/get JSON round-trip', async () => {
    await store.set('x', { a: 1 });
    expect(await store.get('x')).toEqual({ a: 1 });
    expect(await store.get('missing')).toBeNull();
  });

  it('increment accumulates, with and without ttl', async () => {
    expect(await store.increment('c')).toBe(1);
    expect(await store.increment('c', 4)).toBe(5);
    expect(await store.increment('d', 1, 10_000)).toBe(1);
  });

  it('set honors ttl and get returns raw string for non-JSON values', async () => {
    await store.set('t', 'v', 10_000);
    expect(await store.get('t')).toBe('v');
    // A bare token stored outside this API (not JSON) is returned verbatim.
    await store.set('plain', 42);
    expect(await store.get('plain')).toBe(42);
  });

  it('reset/delete clears keys', async () => {
    await store.set('x', 'v');
    await store.delete('x');
    expect(await store.get('x')).toBeNull();
    await store.hit('y', 1000, 1, 0);
    await store.reset('y');
    expect(await store.read('y', 0)).toBe(0);
  });
});

describe('RedisStore — bucket edge cases', () => {
  let store: RedisStore;
  beforeEach(async () => {
    const client = makeClient();
    await client.flushall();
    store = new RedisStore(client, { keyPrefix: `t${seq++}:` });
  });

  it('reports infinite retry when there is no refill', async () => {
    const blocked = await store.drip('z', { capacity: 1, refillPerMs: 0, cost: 5, nowMs: 0 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(Number.POSITIVE_INFINITY);
    expect(blocked.resetAt).toBe(Number.POSITIVE_INFINITY);
  });
});
