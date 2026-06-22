/**
 * Security scenarios — "Burst Traffic": concurrency correctness under load.
 *
 * Stresses the limiter with large simultaneous bursts and verifies the count is
 * always exact (the store increments atomically, so no request slips through),
 * that token-bucket capacity caps a burst, and that the key dimension decides
 * how bursts across endpoints / users-behind-one-IP are bucketed.
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
  method: 'GET',
  path: '/x',
  headers: {},
  ...over,
});

const newLimiter = (clock = new FakeClock(0)) =>
  new RateLimiter({ store: new MemoryStore(), clock });

/** Count granted results from a list of check() promises. */
const granted = (results: { allowed: boolean }[]) => results.filter((r) => r.allowed).length;

describe('1 & 2. Thousands of requests in one second / one millisecond', () => {
  it('a 5000-way simultaneous burst grants exactly the limit', async () => {
    const limiter = newLimiter(); // fixed clock => all "within one millisecond"
    const opts: RateLimitOptions = { max: 100, window: '1s', keyBy: 'ip' };
    const results = await Promise.all(
      Array.from({ length: 5000 }, () => limiter.check(ctx(), opts)),
    );
    expect(granted(results)).toBe(100);
  });

  it('sequential high volume blocks everything past the limit', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 50, window: '1m', keyBy: 'ip' };
    let allowed = 0;
    for (let i = 0; i < 10_000; i++) if ((await limiter.check(ctx(), opts)).allowed) allowed++;
    expect(allowed).toBe(50);
  });
});

describe('3, 4, 5, 9. Multiplexing / many connections / keep-alive / large pools', () => {
  it('all map to one IP key — connection multiplicity never inflates the budget', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 10, window: '1m', keyBy: 'ip' };
    // 2000 requests spread across 2000 "connections" of the same client.
    const results = await Promise.all(
      Array.from({ length: 2000 }, (_, conn) => limiter.check(ctx({ raw: { conn } }), opts)),
    );
    expect(granted(results)).toBe(10);
  });
});

describe('6. Different payload sizes', () => {
  it('payload size is not a key dimension — every request counts the same', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 5, window: '1m', keyBy: 'ip' };
    const sizes = ['0', '1024', '1048576', '52428800', '8', '999'];
    let allowed = 0;
    for (const size of sizes) {
      if ((await limiter.check(ctx({ headers: { 'content-length': size } }), opts)).allowed)
        allowed++;
    }
    expect(allowed).toBe(5);
  });
});

describe('7. Multiple endpoints simultaneously', () => {
  it('route keying gives each endpoint its own burst budget', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 3, window: '1m', keyBy: 'route' };
    const endpoints = ['/a', '/b', '/c'];
    const results = await Promise.all(
      endpoints.flatMap((path) =>
        Array.from({ length: 10 }, () => limiter.check(ctx({ path, method: 'GET' }), opts)),
      ),
    );
    // 3 endpoints × 3 allowed each = 9 granted out of 30.
    expect(granted(results)).toBe(9);
  });
});

describe('8. Multiple users sharing one IP', () => {
  const ip = '203.0.113.9';
  const users = Array.from({ length: 10 }, (_, i) => `user-${i}`);

  it('IP keying lumps all NAT users into one budget (collateral / shared cap)', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 5, window: '1m', keyBy: 'ip' };
    const results = await Promise.all(
      users.map((userId) => limiter.check(ctx({ ip, userId }), opts)),
    );
    expect(granted(results)).toBe(5); // only 5 of 10 distinct users get through
  });

  it('user keying gives each NAT user a fair independent budget (mitigation)', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 5, window: '1m', keyBy: 'user' };
    const results = await Promise.all(
      users.map((userId) => limiter.check(ctx({ ip, userId }), opts)),
    );
    expect(granted(results)).toBe(10); // each user well under their own limit
  });
});

describe('10. CDN cache misses causing origin bursts (token bucket)', () => {
  it('token-bucket capacity caps a sudden origin burst', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = {
      max: 20,
      window: '1s',
      keyBy: 'ip',
      algorithm: 'token-bucket',
    };
    // A cache stampede hits the origin with 500 concurrent requests.
    const results = await Promise.all(
      Array.from({ length: 500 }, () => limiter.check(ctx(), opts)),
    );
    expect(granted(results)).toBe(20); // bounded by bucket capacity
  });

  it('the bucket refills to absorb the next wave at the configured rate', async () => {
    const clock = new FakeClock(0);
    const limiter = newLimiter(clock);
    const opts: RateLimitOptions = {
      max: 20,
      window: '1s',
      keyBy: 'ip',
      algorithm: 'token-bucket',
    };
    await Promise.all(Array.from({ length: 500 }, () => limiter.check(ctx(), opts))); // drain
    clock.t = 500; // half the window → ~10 tokens refilled
    const wave = await Promise.all(Array.from({ length: 500 }, () => limiter.check(ctx(), opts)));
    expect(granted(wave)).toBe(10);
  });
});
