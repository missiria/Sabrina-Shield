/**
 * Security scenarios — "Parallel Requests": race-condition correctness.
 *
 * The danger with parallel traffic is a lost-update race: two requests read the
 * same counter, both see room, both proceed. These tests fire large parallel
 * batches at the rate limiter, the abuse counter, and the API-key validator and
 * assert there is NO over-grant and NO lost increment — every parallel mutation
 * is observed exactly once, because the store's read-modify-write runs to
 * completion without interleaving.
 */
import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../cache/memory-store';
import { RateLimiter } from './rate-limiter';
import { AbuseDetector } from '../security/abuse/abuse-detector';
import { ApiKeyValidator } from '../api-key/api-key';
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

const newLimiter = (clock = new FakeClock(0)) =>
  new RateLimiter({ store: new MemoryStore(), clock });
const granted = (rs: { allowed: boolean }[]) => rs.filter((r) => r.allowed).length;

describe('1, 2, 3. 100 / 500 / 1000 parallel requests', () => {
  it.each([100, 500, 1000])('%i parallel hits grant exactly the limit', async (n) => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 10, window: '1m', keyBy: 'ip' };
    const results = await Promise.all(Array.from({ length: n }, () => limiter.check(ctx(), opts)));
    expect(granted(results)).toBe(10);
  });
});

describe('4 & 5. Parallel requests across threads / API nodes (shared store)', () => {
  it('independent limiter instances on one store still enforce a single budget', async () => {
    const store = new MemoryStore(); // shared backing store across "nodes"
    const nodes = Array.from(
      { length: 8 },
      () => new RateLimiter({ store, clock: new FakeClock(0) }),
    );
    const opts: RateLimitOptions = { max: 10, window: '1m', keyBy: 'ip' };
    // 800 requests fanned across 8 nodes, all hitting the same key concurrently.
    const results = await Promise.all(
      Array.from({ length: 800 }, (_, i) => nodes[i % nodes.length]!.check(ctx(), opts)),
    );
    expect(granted(results)).toBe(10);
  });
});

describe('6 & 9. Simultaneous login attempts / retries (abuse counter)', () => {
  it('parallel increments are never lost — each is observed exactly once', async () => {
    const detector = new AbuseDetector({
      store: new MemoryStore(),
      rules: { 'brute-force': { max: 5, window: '5m', keyBy: 'ip' } },
    });
    const results = await Promise.all(
      Array.from({ length: 200 }, () => detector.record('brute-force', ctx())),
    );
    const counts = results.map((r) => r.count);
    // No lost update => every count value 1..200 appears exactly once.
    expect(new Set(counts).size).toBe(200);
    expect(Math.max(...counts)).toBe(200);
    expect(results.every((r) => r.rule === 'brute-force')).toBe(true);
  });

  it('the threshold trips and stays tripped under the parallel flood', async () => {
    const detector = new AbuseDetector({
      store: new MemoryStore(),
      rules: { 'brute-force': { max: 5, window: '5m', keyBy: 'ip' } },
    });
    const results = await Promise.all(
      Array.from({ length: 50 }, () => detector.record('brute-force', ctx())),
    );
    expect(results.filter((r) => r.abusive)).toHaveLength(45); // counts 6..50 are abusive
  });
});

describe('7. Simultaneous token refreshes', () => {
  it('parallel refreshes for one user share a single budget', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 3, window: '1m', keyBy: 'user' };
    const results = await Promise.all(
      Array.from({ length: 100 }, () => limiter.check(ctx({ userId: 'u1' }), opts)),
    );
    expect(granted(results)).toBe(3);
  });
});

describe('8. Simultaneous API-key requests', () => {
  it('parallel validation is consistent (stateless, no shared-state race)', async () => {
    const validator = new ApiKeyValidator({ keys: ['good'] });
    const good = await Promise.all(
      Array.from({ length: 1000 }, () =>
        validator.validate(ctx({ headers: { 'x-api-key': 'good' } })),
      ),
    );
    expect(good.every((r) => r.valid)).toBe(true);
    const bad = await Promise.all(
      Array.from({ length: 1000 }, () =>
        validator.validate(ctx({ headers: { 'x-api-key': 'nope' } })),
      ),
    );
    expect(bad.every((r) => !r.valid)).toBe(true);
  });

  it('rate limiting keyed by apiKey caps parallel use of one key', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 10, window: '1m', keyBy: 'apiKey' };
    const results = await Promise.all(
      Array.from({ length: 500 }, () =>
        limiter.check(ctx({ headers: { 'x-api-key': 'shared' } }), opts),
      ),
    );
    expect(granted(results)).toBe(10);
  });
});

describe('10. Simultaneous WebSocket upgrades', () => {
  it('parallel upgrade requests are rate limited like any other request', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 5, window: '1m', keyBy: 'ip' };
    const upgrade = ctx({
      method: 'GET',
      path: '/ws',
      headers: { upgrade: 'websocket', connection: 'Upgrade' },
    });
    const results = await Promise.all(
      Array.from({ length: 300 }, () => limiter.check(upgrade, opts)),
    );
    expect(granted(results)).toBe(5);
  });
});
