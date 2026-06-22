/**
 * Security scenarios — "Rate Limit Reset" against the distributed RedisStore.
 *
 * Covers what changes when state lives in Redis rather than process memory:
 * restarting Redis loses non-persisted counters (scenario 6), and — unlike the
 * in-memory store — windowed counting is driven by Redis-side TTLs, so app-level
 * clock drift between instances cannot prematurely reset a counter
 * (mitigation for scenarios 3 & 7).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Redis from 'ioredis-mock';
import { RateLimiter, type RateLimitOptions } from '@sabrina-shield/core';
import { RedisStore } from './redis-store';

let seq = 0;
function makeClient() {
  return new Redis() as unknown as import('ioredis').Redis;
}

const ctx = () => ({ ip: '1.2.3.4', method: 'POST', path: '/login', headers: {} });
const FIXED: RateLimitOptions = { max: 5, window: '1m', keyBy: 'ip' };

describe('6. Restart Redis (non-persistent) loses counters', () => {
  it('flushing Redis grants a fresh budget — enable persistence to mitigate', async () => {
    const client = makeClient();
    await client.flushall();
    const store = new RedisStore(client, { keyPrefix: `t${seq++}:` });
    const limiter = new RateLimiter({ store });

    let allowed = 0;
    for (let i = 0; i < 5; i++) if ((await limiter.check(ctx(), FIXED)).allowed) allowed++;
    expect(allowed).toBe(5);
    expect((await limiter.check(ctx(), FIXED)).allowed).toBe(false);

    // Simulate a Redis restart without persistence: the dataset is gone.
    await client.flushall();
    expect((await limiter.check(ctx(), FIXED)).allowed).toBe(true);
    // Mitigation: run Redis with AOF/RDB persistence so counters survive restart.
  });
});

describe('3 & 7. App clock drift cannot reset Redis-backed windows', () => {
  // RedisStore.hit counts via INCR + a server-side PEXPIRE; the app clock is
  // only used to report resetAt. So two instances with wildly different clocks
  // sharing one Redis still enforce one budget.
  let client: import('ioredis').Redis;
  beforeEach(async () => {
    client = makeClient();
    await client.flushall();
  });

  it('a fast second instance does not get extra budget', async () => {
    const prefix = `t${seq++}:`;
    const serverA = new RateLimiter({
      store: new RedisStore(client, { keyPrefix: prefix }),
      clock: { now: () => 0 },
    });
    const serverB = new RateLimiter({
      store: new RedisStore(client, { keyPrefix: prefix }),
      clock: { now: () => 10_000_000 }, // way ahead of A
    });

    let allowed = 0;
    for (let i = 0; i < 5; i++) if ((await serverA.check(ctx(), FIXED)).allowed) allowed++;
    expect(allowed).toBe(5);
    // Despite B's clock being far ahead, the Redis counter/TTL is authoritative.
    expect((await serverB.check(ctx(), FIXED)).allowed).toBe(false);
  });
});

describe('10. Stale entries — reset clears state deterministically', () => {
  it('reset() removes the counter so the next request starts fresh', async () => {
    const client = makeClient();
    await client.flushall();
    const store = new RedisStore(client, { keyPrefix: `t${seq++}:` });
    const limiter = new RateLimiter({ store });
    for (let i = 0; i < 5; i++) await limiter.check(ctx(), FIXED);
    expect((await limiter.check(ctx(), FIXED)).allowed).toBe(false);
    await store.reset('ip=1.2.3.4');
    expect((await limiter.check(ctx(), FIXED)).allowed).toBe(true);
  });
});
