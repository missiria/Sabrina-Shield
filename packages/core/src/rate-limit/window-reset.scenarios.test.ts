/**
 * Security scenarios — "Rate Limit Reset": can an attacker abuse the window
 * reset boundary?
 *
 * These cover boundary bursts, clock drift between instances, off-by-one timing,
 * post-TTL floods, in-process counter loss on restart, and stale entries. Each
 * test pins the exact behaviour and, where the default (fixed window) is
 * exploitable, shows the mitigation: the sliding window or token bucket, or a
 * shared/persistent store.
 */
import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../cache/memory-store';
import { RateLimiter } from './rate-limiter';
import type { Clock } from '../interfaces/clock';
import type { RequestContext } from '../interfaces/request-context';
import type { RateLimitOptions } from './types';

class FakeClock implements Clock {
  constructor(public t = 0) {}
  now() {
    return this.t;
  }
}

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  ip: '1.2.3.4',
  method: 'POST',
  path: '/login',
  headers: {},
  ...over,
});

/** Hit the limiter `n` times at the clock's current instant; return allowed count. */
async function burst(
  limiter: RateLimiter,
  opts: RateLimitOptions,
  n: number,
  request: RequestContext = ctx(),
): Promise<number> {
  let allowed = 0;
  for (let i = 0; i < n; i++) {
    if ((await limiter.check(request, opts)).allowed) allowed++;
  }
  return allowed;
}

const FIXED: RateLimitOptions = { max: 5, window: '1m', keyBy: 'ip' };
const SLIDING: RateLimitOptions = {
  max: 5,
  window: '1m',
  keyBy: 'ip',
  algorithm: 'sliding-window',
};

describe('1. Burst exactly when the window resets', () => {
  it('fixed window allows back-to-back budgets across the boundary (weakness)', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    // Open the window with one early hit, then pack the rest at the very end…
    expect((await limiter.check(ctx(), FIXED)).allowed).toBe(true);
    clock.t = 59_000;
    expect(await burst(limiter, FIXED, 4)).toBe(4); // fills the window (total 5)
    expect((await limiter.check(ctx(), FIXED)).allowed).toBe(false);
    // …then immediately after reset, a full fresh budget — ~9 hits in ~1s.
    clock.t = 60_000;
    expect(await burst(limiter, FIXED, 5)).toBe(5);
  });

  it('sliding window blocks the post-boundary burst (mitigation)', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    expect(await burst(limiter, SLIDING, 5)).toBe(5); // fill window 0
    clock.t = 60_000; // exactly the boundary: previous window weighted at ~100%
    expect((await limiter.check(ctx(), SLIDING)).allowed).toBe(false);
  });
});

describe('2. Synchronize multiple bots to fire at the reset boundary', () => {
  const ROUTE_FIXED: RateLimitOptions = { max: 5, window: '1m', keyBy: 'route' };
  const ROUTE_SLIDING: RateLimitOptions = { ...ROUTE_FIXED, algorithm: 'sliding-window' };
  const bots = (i: number) => ctx({ ip: `10.0.0.${i}` }); // same route, many sources

  it('bots sharing one bucket still double at the boundary under fixed window (weakness)', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    let allowed = 0;
    for (let i = 0; i < 5; i++) if ((await limiter.check(bots(i), ROUTE_FIXED)).allowed) allowed++;
    clock.t = 60_000; // boundary
    for (let i = 0; i < 5; i++) if ((await limiter.check(bots(i), ROUTE_FIXED)).allowed) allowed++;
    expect(allowed).toBe(10); // 5 + 5 across the reset
  });

  it('sliding window holds the aggregate across the boundary (mitigation)', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    for (let i = 0; i < 5; i++) await limiter.check(bots(i), ROUTE_SLIDING);
    clock.t = 60_000;
    expect((await limiter.check(bots(99), ROUTE_SLIDING)).allowed).toBe(false);
  });
});

describe('3 & 7. Clock drift / unsynchronized servers over a shared store', () => {
  it('a fast instance prematurely resets the shared counter (weakness)', async () => {
    const store = new MemoryStore(); // shared backing store
    const serverA = new RateLimiter({ store, clock: new FakeClock(0) });
    const fastClock = new FakeClock(0);
    const serverB = new RateLimiter({ store, clock: fastClock });

    expect(await burst(serverA, FIXED, 5)).toBe(5); // A fills the window at t=0
    expect((await serverA.check(ctx(), FIXED)).allowed).toBe(false);

    // B's clock runs ahead past the window end → it resets the shared counter
    // even though little real time has passed.
    fastClock.t = 60_001;
    expect((await serverB.check(ctx(), FIXED)).allowed).toBe(true);
  });

  it('a slow instance does NOT get extra budget (no exploit when behind)', async () => {
    const store = new MemoryStore();
    const serverA = new RateLimiter({ store, clock: new FakeClock(0) });
    const slow = new FakeClock(0);
    const serverB = new RateLimiter({ store, clock: slow });
    expect(await burst(serverA, FIXED, 5)).toBe(5);
    slow.t = 30_000; // still inside the window
    expect((await serverB.check(ctx(), FIXED)).allowed).toBe(false);
  });
});

describe('4 & 8. Off-by-one / precise timing around expiration', () => {
  const ONE: RateLimitOptions = { max: 1, window: 1000, keyBy: 'ip' };

  it('reset is inclusive at resetAt with no double counting', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    const first = await limiter.check(ctx(), ONE);
    expect(first.allowed).toBe(true);
    expect(first.resetAt).toBe(1000);

    clock.t = 999; // one tick before the boundary → still blocked
    expect((await limiter.check(ctx(), ONE)).allowed).toBe(false);

    clock.t = 1000; // exactly at resetAt → fresh window, count restarts at 1
    const reopened = await limiter.check(ctx(), ONE);
    expect(reopened.allowed).toBe(true);
    expect(reopened.remaining).toBe(0); // not 1 left over from a miscount
    expect(reopened.resetAt).toBe(2000);
  });
});

describe('5. Restart the application (in-memory counters)', () => {
  it('a fresh MemoryStore loses counters — restart grants a new budget (weakness)', async () => {
    const clock = new FakeClock(0);
    const before = new RateLimiter({ store: new MemoryStore(), clock });
    expect(await burst(before, FIXED, 5)).toBe(5);
    expect((await before.check(ctx(), FIXED)).allowed).toBe(false);

    // Simulate a process restart: counters live in process memory and are gone.
    const after = new RateLimiter({ store: new MemoryStore(), clock });
    expect((await after.check(ctx(), FIXED)).allowed).toBe(true);
    // Mitigation: a shared external store (RedisStore) survives app restarts.
  });
});

describe('9. Flood immediately after TTL expiration', () => {
  it('fixed window grants a full fresh burst right after expiry (weakness)', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    expect(await burst(limiter, FIXED, 5)).toBe(5);
    clock.t = 60_001;
    expect(await burst(limiter, FIXED, 5)).toBe(5); // full 5 again instantly
  });

  it('token bucket only refills gradually, smoothing the post-expiry flood (mitigation)', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    const bucket: RateLimitOptions = {
      max: 5,
      window: '1m',
      keyBy: 'ip',
      algorithm: 'token-bucket',
    };
    expect(await burst(limiter, bucket, 5)).toBe(5);
    clock.t = 12_000; // one refill interval (window/max = 12s) → exactly 1 token
    expect(await burst(limiter, bucket, 5)).toBe(1);
  });
});

describe('10. Force stale cache entries', () => {
  it('an expired counter reads as 0, never a stale value, and restarts cleanly', async () => {
    const store = new MemoryStore();
    await store.hit('ip=1.2.3.4', 1000, 3, 0); // count 3, window [0,1000)
    expect(await store.read('ip=1.2.3.4', 500)).toBe(3); // live
    expect(await store.read('ip=1.2.3.4', 2000)).toBe(0); // expired → not stale 3

    const fresh = await store.hit('ip=1.2.3.4', 1000, 1, 2000); // new window
    expect(fresh.count).toBe(1); // starts at cost, not 3 + 1
    expect(fresh.resetAt).toBe(3000);
  });

  it('sweep evicts expired entries without affecting live ones', async () => {
    const store = new MemoryStore();
    await store.hit('expired', 100, 1, 0);
    await store.hit('live', 10_000, 1, 0);
    store.sweep(5000);
    expect(await store.read('expired', 5000)).toBe(0);
    expect(await store.read('live', 5000)).toBe(1);
  });
});
