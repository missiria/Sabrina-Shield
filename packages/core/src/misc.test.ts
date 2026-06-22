import { describe, it, expect } from 'vitest';
import { NoopLogger } from './interfaces/logger';
import { SystemClock } from './interfaces/clock';
import {
  CountryBlockedError,
  BotDetectedError,
  AbuseDetectedError,
  RoleForbiddenError,
} from './errors/errors';
import { MemoryStore } from './cache/memory-store';
import { RateLimiter } from './rate-limit/rate-limiter';
import { resolveKey } from './rate-limit/key-resolver';
import { IpBlocklist } from './security/blocklist/blocklist';
import type { RequestContext } from './interfaces/request-context';

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  ip: '1.2.3.4',
  method: 'GET',
  path: '/x',
  headers: {},
  ...over,
});

describe('NoopLogger + SystemClock', () => {
  it('NoopLogger methods are callable no-ops', () => {
    const log = new NoopLogger();
    expect(() => {
      log.debug('a');
      log.info('b');
      log.warn('c');
      log.error('d');
    }).not.toThrow();
  });
  it('SystemClock returns a positive epoch', () => {
    expect(new SystemClock().now()).toBeGreaterThan(0);
  });
});

describe('remaining ShieldError classes', () => {
  it('expose defaults', () => {
    expect(new CountryBlockedError().code).toBe('COUNTRY_BLOCKED');
    expect(new BotDetectedError().code).toBe('BOT_DETECTED');
    expect(new AbuseDetectedError().status).toBe(429);
    expect(new RoleForbiddenError().status).toBe(403);
  });
});

describe('leaky-bucket algorithm', () => {
  it('enforces a steady rate', async () => {
    const limiter = new RateLimiter({ store: new MemoryStore(), clock: { now: () => 0 } });
    const opts = { max: 2, window: '1s' as const, algorithm: 'leaky-bucket' as const };
    expect((await limiter.consume('k', opts)).allowed).toBe(true);
    expect((await limiter.consume('k', opts)).allowed).toBe(true);
    expect((await limiter.consume('k', opts)).allowed).toBe(false);
  });
});

describe('resolveKey extra dimensions', () => {
  it('keys by apiKey from header and falls back to "-"', () => {
    expect(
      resolveKey(ctx({ headers: { 'x-api-key': 'abc' } }), {
        max: 1,
        window: '1m',
        keyBy: 'apiKey',
      }),
    ).toBe('apiKey=abc');
    expect(resolveKey(ctx(), { max: 1, window: '1m', keyBy: 'user' })).toBe('user=-');
  });
  it('keys by fingerprint', () => {
    expect(resolveKey(ctx(), { max: 1, window: '1m', keyBy: 'fingerprint' })).toMatch(
      /^fingerprint=[a-f0-9]{64}$/,
    );
  });
});

describe('IpBlocklist permanent block via block()', () => {
  it('adds to the permanent set without a ttl', async () => {
    const bl = new IpBlocklist();
    await bl.block('5.5.5.5');
    expect(await bl.isBlocked('5.5.5.5')).toBe(true);
    expect(bl.listPermanent()).toContain('5.5.5.5');
  });
});
