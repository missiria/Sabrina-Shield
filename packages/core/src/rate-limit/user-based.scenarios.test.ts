/**
 * Security scenarios — "User-Based Rate Limiting": can an attacker bypass user
 * limits, and does multi-dimensional evaluation stop them?
 *
 * A single-dimension limit is bypassed by rotating that one attribute (new
 * account, fresh token, another device). The architectural answer is to
 * evaluate a request against SEVERAL independent policies and block if ANY trip
 * — so changing one attribute (e.g. the user id) still trips another (ip or
 * device fingerprint). These tests demonstrate the per-dimension bypass and the
 * layered-policy mitigation, ending with the multi-dimensional showcase.
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
  path: '/api',
  headers: { 'user-agent': 'device-A', 'accept-language': 'en' },
  ...over,
});

const newLimiter = (clock = new FakeClock(0)) =>
  new RateLimiter({ store: new MemoryStore(), clock });

/** Evaluate a request against several policies; blocked if ANY policy trips. */
async function evaluateAll(
  limiter: RateLimiter,
  request: RequestContext,
  policies: RateLimitOptions[],
): Promise<boolean> {
  let allowed = true;
  for (const policy of policies) {
    // Every policy must be consumed so each dimension's counter advances.
    const result = await limiter.check(request, policy);
    if (!result.allowed) allowed = false;
  }
  return allowed;
}

/** Send n requests through a policy set, return how many were fully allowed. */
async function run(
  limiter: RateLimiter,
  n: number,
  factory: (i: number) => RequestContext,
  policies: RateLimitOptions[],
): Promise<number> {
  let allowed = 0;
  for (let i = 0; i < n; i++) if (await evaluateAll(limiter, factory(i), policies)) allowed++;
  return allowed;
}

const USER_ONLY: RateLimitOptions[] = [{ max: 5, window: '1h', keyBy: 'user' }];
const USER_PLUS_IP: RateLimitOptions[] = [
  { max: 5, window: '1h', keyBy: 'user' },
  { max: 10, window: '1m', keyBy: 'ip' },
];

describe('1 & 2. Create many free accounts / use stolen accounts', () => {
  it('user-only limiting lets each fresh account through (bypass)', async () => {
    const allowed = await run(newLimiter(), 100, (i) => ctx({ userId: `acct-${i}` }), USER_ONLY);
    expect(allowed).toBe(100);
  });

  it('layering an IP policy caps signups from one source regardless of account count (mitigation)', async () => {
    const allowed = await run(newLimiter(), 100, (i) => ctx({ userId: `acct-${i}` }), USER_PLUS_IP);
    expect(allowed).toBe(10); // the ip dimension trips after 10
  });
});

describe('3 & 4. Rotate refresh / access tokens', () => {
  it('keying on the bearer token is bypassed by rotation; keying on the user id is not', async () => {
    const byToken: RateLimitOptions[] = [
      { max: 5, window: '1h', keyBy: 'header', header: 'authorization' },
    ];
    const byUser: RateLimitOptions[] = [{ max: 5, window: '1h', keyBy: 'user' }];
    const rotating = (i: number) =>
      ctx({ userId: 'u1', headers: { authorization: `Bearer tok-${i}` } });

    expect(await run(newLimiter(), 20, rotating, byToken)).toBe(20); // token rotation evades
    expect(await run(newLimiter(), 20, rotating, byUser)).toBe(5); // stable identity holds
  });
});

describe('5. Switch between devices', () => {
  it('fingerprint keying is bypassed by new devices; user keying spans them (mitigation)', async () => {
    const byFingerprint: RateLimitOptions[] = [{ max: 5, window: '1h', keyBy: 'fingerprint' }];
    const byUser: RateLimitOptions[] = [{ max: 5, window: '1h', keyBy: 'user' }];
    const devices = (i: number) => ctx({ userId: 'u1', headers: { 'user-agent': `device-${i}` } });

    expect(await run(newLimiter(), 20, devices, byFingerprint)).toBe(20);
    expect(await run(newLimiter(), 20, devices, byUser)).toBe(5);
  });
});

describe('6. Login/logout repeatedly', () => {
  it('session-id keying resets on each session; user keying is stable across them', async () => {
    const bySession: RateLimitOptions[] = [
      { max: 5, window: '1h', keyBy: 'header', header: 'x-session-id' },
    ];
    const byUser: RateLimitOptions[] = [{ max: 5, window: '1h', keyBy: 'user' }];
    const churn = (i: number) => ctx({ userId: 'u1', headers: { 'x-session-id': `sess-${i}` } });

    expect(await run(newLimiter(), 20, churn, bySession)).toBe(20);
    expect(await run(newLimiter(), 20, churn, byUser)).toBe(5);
  });
});

describe('7. Guest vs authenticated flows', () => {
  it('anonymous users collapse onto one user bucket (collateral); fingerprint separates devices', async () => {
    // No userId => the user dimension resolves to "-", lumping all guests together.
    const byUser: RateLimitOptions[] = [{ max: 5, window: '1h', keyBy: 'user' }];
    const byFingerprint: RateLimitOptions[] = [{ max: 5, window: '1h', keyBy: 'fingerprint' }];
    const guests = (i: number) =>
      ctx({ userId: undefined, headers: { 'user-agent': `guest-dev-${i}` } });

    expect(await run(newLimiter(), 10, guests, byUser)).toBe(5); // all guests share "user=-"
    expect(await run(newLimiter(), 10, guests, byFingerprint)).toBe(10); // per-device budgets
  });
});

describe('8 & 10. Federated identities / duplicate accounts', () => {
  it('different provider ids dodge user limits; the device/IP layer still catches them', async () => {
    const sameHuman = (i: number) =>
      ctx({
        userId: ['google:1', 'github:1', 'saml:1', 'oidc:1'][i % 4],
        headers: { 'user-agent': 'device-A' },
      });
    // user-only: up to 4 distinct identities each get their own budget.
    expect(await run(newLimiter(), 4, sameHuman, [{ max: 1, window: '1h', keyBy: 'user' }])).toBe(
      4,
    );
    // add a fingerprint policy: the shared device is capped regardless of identity.
    const layered: RateLimitOptions[] = [
      { max: 1, window: '1h', keyBy: 'user' },
      { max: 2, window: '1h', keyBy: 'fingerprint' },
    ];
    expect(await run(newLimiter(), 4, sameHuman, layered)).toBe(2);
  });
});

describe('9. Share one API key across many users', () => {
  it('apiKey keying caps the aggregate; adding the user dimension gives each a fair budget', async () => {
    const byKey: RateLimitOptions[] = [{ max: 5, window: '1m', keyBy: 'apiKey' }];
    const byKeyAndUser: RateLimitOptions[] = [{ max: 5, window: '1m', keyBy: ['apiKey', 'user'] }];
    const users = (i: number) => ctx({ userId: `u-${i}`, headers: { 'x-api-key': 'shared-key' } });

    expect(await run(newLimiter(), 10, users, byKey)).toBe(5); // one shared budget
    expect(await run(newLimiter(), 10, users, byKeyAndUser)).toBe(10); // per-user under the key
  });
});

describe('Multi-dimensional showcase: rotate one attribute, another still trips', () => {
  const MULTI: RateLimitOptions[] = [
    { max: 100, window: '1h', keyBy: 'user' },
    { max: 10, window: '1m', keyBy: 'ip' },
    { max: 20, window: '1h', keyBy: 'fingerprint' },
  ];

  it('rotating only the IP is still bounded by the fingerprint/user dimensions', async () => {
    const allowed = await run(
      newLimiter(),
      50,
      (i) => ctx({ userId: 'u1', ip: `10.0.0.${i}` }),
      MULTI,
    );
    expect(allowed).toBe(20); // fingerprint cap (same device) trips first
  });

  it('rotating only the user id is still bounded by the IP dimension', async () => {
    const allowed = await run(newLimiter(), 50, (i) => ctx({ userId: `u-${i}` }), MULTI);
    expect(allowed).toBe(10); // ip cap trips first
  });

  it('rotating only the device is still bounded by the IP dimension', async () => {
    const allowed = await run(
      newLimiter(),
      50,
      (i) => ctx({ userId: 'u1', headers: { 'user-agent': `dev-${i}` } }),
      MULTI,
    );
    expect(allowed).toBe(10);
  });

  it('only by rotating EVERY dimension at once can an attacker evade (documents the residual gap)', async () => {
    const allowed = await run(
      newLimiter(),
      50,
      (i) => ctx({ userId: `u-${i}`, ip: `10.0.0.${i}`, headers: { 'user-agent': `dev-${i}` } }),
      MULTI,
    );
    expect(allowed).toBe(50); // each dimension sees a unique key => needs reputation/abuse signals
  });
});
