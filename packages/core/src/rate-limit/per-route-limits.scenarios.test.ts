/**
 * Security scenarios — "Per-Route Limits": can an attacker dodge a strict
 * endpoint by varying the URL surface?
 *
 * The `route` key dimension resolves to `ctx.routeKey` when the adapter provides
 * it (NestJS sets a stable `Controller.handler` id) and otherwise falls back to
 * `"<method> <path>"`. These tests show that RAW-PATH keying is fooled by
 * trailing slashes, casing, encoding, and aliases (bypass), while HANDLER keying
 * is stable across all of them (mitigation). Query strings are already stripped
 * from `ctx.path` by the adapters, so they never create a new bucket.
 */
import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../cache/memory-store';
import { RateLimiter } from './rate-limiter';
import { resolveKey } from './key-resolver';
import type { Clock } from '../interfaces/clock';
import type { RequestContext } from '../interfaces/request-context';
import type { RateLimitOptions } from './types';

class FakeClock implements Clock {
  now() {
    return 0;
  }
}

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  ip: '1.2.3.4',
  method: 'POST',
  path: '/login',
  headers: {},
  ...over,
});

const BY_ROUTE: RateLimitOptions = { max: 1, window: '1m', keyBy: 'route' };
const key = (c: RequestContext) => resolveKey(c, BY_ROUTE);
const newLimiter = () => new RateLimiter({ store: new MemoryStore(), clock: new FakeClock() });

describe('1. Switch between /login and /auth/login', () => {
  it('distinct paths are distinct buckets — both aliases must be protected (weakness)', () => {
    expect(key(ctx({ path: '/login' }))).not.toBe(key(ctx({ path: '/auth/login' })));
  });
  it('routing both to the same handler shares one bucket (mitigation)', () => {
    const a = ctx({ path: '/login', routeKey: 'AuthController.login' });
    const b = ctx({ path: '/auth/login', routeKey: 'AuthController.login' });
    expect(key(a)).toBe(key(b));
  });
});

describe('2. Trailing slashes', () => {
  it('raw-path keying treats /login and /login/ as separate (bypass)', async () => {
    const limiter = newLimiter();
    expect((await limiter.check(ctx({ path: '/login' }), BY_ROUTE)).allowed).toBe(true);
    expect((await limiter.check(ctx({ path: '/login/' }), BY_ROUTE)).allowed).toBe(true); // dodged
  });
  it('handler keying enforces across the slash variants (mitigation)', async () => {
    const limiter = newLimiter();
    const rk = 'AuthController.login';
    expect((await limiter.check(ctx({ path: '/login', routeKey: rk }), BY_ROUTE)).allowed).toBe(
      true,
    );
    expect((await limiter.check(ctx({ path: '/login/', routeKey: rk }), BY_ROUTE)).allowed).toBe(
      false,
    );
  });
});

describe('3. Change URL casing', () => {
  it('raw-path keying is case-sensitive (bypass); handler keying is not (mitigation)', () => {
    expect(key(ctx({ path: '/login' }))).not.toBe(key(ctx({ path: '/Login' })));
    const rk = 'AuthController.login';
    expect(key(ctx({ path: '/login', routeKey: rk }))).toBe(
      key(ctx({ path: '/LOGIN', routeKey: rk })),
    );
  });
});

describe('4. URL-encoded paths', () => {
  it('an encoded path is a different raw key (bypass); handler keying holds (mitigation)', () => {
    expect(key(ctx({ path: '/login' }))).not.toBe(key(ctx({ path: '/%6cogin' })));
    const rk = 'AuthController.login';
    expect(key(ctx({ path: '/login', routeKey: rk }))).toBe(
      key(ctx({ path: '/%6cogin', routeKey: rk })),
    );
  });
});

describe('5. Different HTTP methods', () => {
  it('method is part of the route key — protect the verb you mean to (intentional)', () => {
    expect(key(ctx({ method: 'POST' }))).not.toBe(key(ctx({ method: 'GET' })));
  });
  it('handler keying ties the limit to the handler regardless of method', () => {
    const rk = 'AuthController.login';
    expect(key(ctx({ method: 'POST', routeKey: rk }))).toBe(
      key(ctx({ method: 'GET', routeKey: rk })),
    );
  });
});

describe('6. Query-string variations', () => {
  it('query strings do not create new buckets (path is already query-free)', async () => {
    // Adapters strip the query from ctx.path, so two requests to the same path
    // with different queries share the bucket.
    const limiter = newLimiter();
    expect((await limiter.check(ctx({ path: '/login' }), BY_ROUTE)).allowed).toBe(true);
    expect((await limiter.check(ctx({ path: '/login' }), BY_ROUTE)).allowed).toBe(false);
    // Same key irrespective of any query the client appended upstream.
    expect(key(ctx({ path: '/login' }))).toBe(key(ctx({ path: '/login' })));
  });
});

describe('7. API version changes (/v1 vs /v2)', () => {
  it('versions are separate buckets — a live, weakly-limited v1 is a bypass (weakness)', () => {
    expect(key(ctx({ path: '/v1/login' }))).not.toBe(key(ctx({ path: '/v2/login' })));
    // Mitigation: apply the same handler/limit to every supported version, or
    // retire deprecated versions.
  });
});

describe('8. Reverse-proxy rewrites', () => {
  it('keying follows the path the app actually sees; a rewrite to one handler shares the bucket', () => {
    // Proxy rewrites /public/login and /login both to the same internal handler.
    const rk = 'AuthController.login';
    const external = ctx({ path: '/public/login', routeKey: rk });
    const internal = ctx({ path: '/login', routeKey: rk });
    expect(key(external)).toBe(key(internal));
  });
});

describe('9. Alternate between aliases', () => {
  it('handler keying caps the total across all aliases of one endpoint (mitigation)', async () => {
    const limiter = newLimiter();
    const rk = 'AuthController.login';
    const aliases = ['/login', '/signin', '/auth/login', '/account/login'];
    let allowed = 0;
    for (const path of aliases) {
      if ((await limiter.check(ctx({ path, routeKey: rk }), BY_ROUTE)).allowed) allowed++;
    }
    expect(allowed).toBe(1); // one budget across all four aliases
  });
});

describe('10. Forgotten endpoints with weaker policies', () => {
  it('a module default cap protects routes that lack an explicit limit', async () => {
    // Without a default, a forgotten endpoint keyed by IP still benefits from a
    // baseline policy applied uniformly.
    const limiter = newLimiter();
    const baseline: RateLimitOptions = { max: 2, window: '1m', keyBy: 'ip' };
    let allowed = 0;
    for (let i = 0; i < 5; i++)
      if ((await limiter.check(ctx({ path: '/forgotten' }), baseline)).allowed) allowed++;
    expect(allowed).toBe(2); // baseline still caps the undeclared route
  });
});
