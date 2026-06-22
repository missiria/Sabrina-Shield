import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../cache/memory-store';
import { RateLimiter } from './rate-limiter';
import { resolveKey } from './key-resolver';
import type { Clock } from '../interfaces/clock';
import type { RequestContext } from '../interfaces/request-context';

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

describe('RateLimiter — fixed window', () => {
  it('allows up to max then blocks within the window', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    const opts = { max: 2, window: '1m' as const };
    expect((await limiter.consume('k', opts)).allowed).toBe(true);
    expect((await limiter.consume('k', opts)).allowed).toBe(true);
    const third = await limiter.consume('k', opts);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets after the window elapses', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    const opts = { max: 1, window: '1s' as const };
    expect((await limiter.consume('k', opts)).allowed).toBe(true);
    expect((await limiter.consume('k', opts)).allowed).toBe(false);
    clock.t = 1001;
    expect((await limiter.consume('k', opts)).allowed).toBe(true);
  });
});

describe('RateLimiter — token bucket', () => {
  it('refills over time', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    const opts = { max: 2, window: '1s' as const, algorithm: 'token-bucket' as const };
    expect((await limiter.consume('k', opts)).allowed).toBe(true);
    expect((await limiter.consume('k', opts)).allowed).toBe(true);
    expect((await limiter.consume('k', opts)).allowed).toBe(false);
    clock.t = 600; // > 500ms => +1 token
    expect((await limiter.consume('k', opts)).allowed).toBe(true);
  });
});

describe('RateLimiter — sliding window', () => {
  it('blocks bursts beyond the limit', async () => {
    const clock = new FakeClock(0);
    const limiter = new RateLimiter({ store: new MemoryStore(), clock });
    const opts = { max: 3, window: '1m' as const, algorithm: 'sliding-window' as const };
    let last;
    for (let i = 0; i < 4; i++) last = await limiter.consume('k', opts);
    expect(last!.allowed).toBe(false);
  });
});

describe('RateLimiter — unknown algorithm', () => {
  it('throws', async () => {
    const limiter = new RateLimiter({ store: new MemoryStore() });
    await expect(
      // @ts-expect-error intentional bad value
      limiter.consume('k', { max: 1, window: '1m', algorithm: 'nope' }),
    ).rejects.toThrow();
  });
});

describe('resolveKey', () => {
  it('keys by ip by default', () => {
    expect(resolveKey(ctx(), { max: 1, window: '1m' })).toBe('ip=1.2.3.4');
  });
  it('combines multiple dimensions with a prefix', () => {
    const key = resolveKey(ctx({ userId: 'u1', routeKey: 'GET /x' }), {
      max: 1,
      window: '1m',
      keyBy: ['user', 'route'],
      prefix: 'login',
    });
    expect(key).toBe('login:user=u1|route=GET /x');
  });
  it('reads a header dimension', () => {
    const key = resolveKey(ctx({ headers: { 'x-tenant': 'acme' } }), {
      max: 1,
      window: '1m',
      keyBy: 'header',
      header: 'x-tenant',
    });
    expect(key).toBe('header=acme');
  });
});
