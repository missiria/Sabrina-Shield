/**
 * Security scenarios — "Basic IP Rate Limit": can an attacker bypass an
 * IP-only limiter, and what mitigations does the toolkit offer?
 *
 * Each scenario both (a) demonstrates the inherent weakness of keying purely by
 * IP and (b) verifies a mitigation Sabrina Shield provides: keying by
 * fingerprint (device-stable across IP changes), by user/apiKey (identity), or
 * IPv4-mapped normalization. Where a vector is "within policy" by design
 * (low-and-slow under the limit), the test documents that and points at the
 * longer-horizon control.
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

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120';

function ctx(over: Partial<RequestContext> = {}): RequestContext {
  return {
    ip: '1.2.3.4',
    method: 'POST',
    path: '/login',
    headers: { 'user-agent': BROWSER_UA, 'accept-language': 'en-US' },
    ...over,
  };
}

/** Send `n` requests built by `factory`, return how many were allowed. */
async function send(
  limiter: RateLimiter,
  opts: RateLimitOptions,
  n: number,
  factory: (i: number) => RequestContext,
): Promise<number> {
  let allowed = 0;
  for (let i = 0; i < n; i++) {
    if ((await limiter.check(factory(i), opts)).allowed) allowed++;
  }
  return allowed;
}

const newLimiter = (clock = new FakeClock(0)) =>
  new RateLimiter({ store: new MemoryStore(), clock });

const IP_ONLY: RateLimitOptions = { max: 5, window: '1m', keyBy: 'ip' };
const BY_FINGERPRINT: RateLimitOptions = { max: 5, window: '1m', keyBy: 'fingerprint' };

describe('1. Rotate through many IPv4 proxy servers', () => {
  it('IP-only lets every proxy through (weakness)', async () => {
    const allowed = await send(newLimiter(), IP_ONLY, 50, (i) => ctx({ ip: `10.0.${i}.1` }));
    expect(allowed).toBe(50); // each unique IP gets its own bucket
  });

  it('fingerprint keying caps the same client across all proxies (mitigation)', async () => {
    const allowed = await send(newLimiter(), BY_FINGERPRINT, 50, (i) => ctx({ ip: `10.0.${i}.1` }));
    expect(allowed).toBe(5); // same device fingerprint, IP ignored
  });
});

describe('2. Residential proxy network with thousands of consumer IPs', () => {
  it('IP-only scales linearly with the proxy pool (weakness)', async () => {
    const allowed = await send(newLimiter(), IP_ONLY, 1000, (i) =>
      ctx({ ip: `100.64.${i >> 8}.${i & 0xff}` }),
    );
    expect(allowed).toBe(1000);
  });

  it('user/apiKey keying binds the limit to identity, not IP (mitigation)', async () => {
    const byUser: RateLimitOptions = { max: 5, window: '1m', keyBy: 'user' };
    const allowed = await send(newLimiter(), byUser, 1000, (i) =>
      ctx({ ip: `100.64.${i >> 8}.${i & 0xff}`, userId: 'victim-account' }),
    );
    expect(allowed).toBe(5); // one account, thousands of IPs => still 5
  });
});

describe('3. Switch between IPv4 and IPv6 addresses', () => {
  it('IPv4-mapped IPv6 collapses to the same bucket (mitigation)', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 1, window: '1m', keyBy: 'ip' };
    expect((await limiter.check(ctx({ ip: '1.2.3.4' }), opts)).allowed).toBe(true);
    // Same client arriving as IPv4-mapped IPv6 must NOT get a fresh bucket.
    expect((await limiter.check(ctx({ ip: '::ffff:1.2.3.4' }), opts)).allowed).toBe(false);
  });

  it('genuinely distinct v4 and v6 are separate buckets (documented limit)', async () => {
    const limiter = newLimiter();
    const opts: RateLimitOptions = { max: 1, window: '1m', keyBy: 'ip' };
    expect((await limiter.check(ctx({ ip: '1.2.3.4' }), opts)).allowed).toBe(true);
    expect((await limiter.check(ctx({ ip: '2001:db8::1' }), opts)).allowed).toBe(true);
    // Mitigation: fingerprint keys the device regardless of address family.
    const fp = newLimiter();
    expect(
      (await fp.check(ctx({ ip: '1.2.3.4' }), { max: 1, window: '1m', keyBy: 'fingerprint' }))
        .allowed,
    ).toBe(true);
    expect(
      (await fp.check(ctx({ ip: '2001:db8::1' }), { max: 1, window: '1m', keyBy: 'fingerprint' }))
        .allowed,
    ).toBe(false);
  });
});

describe('4. Multiple VPN providers', () => {
  it('IP-only treats each exit node as new (weakness); fingerprint does not (mitigation)', async () => {
    const exits = (i: number) => ctx({ ip: `185.${i}.10.20` }); // different VPN egress IPs
    expect(await send(newLimiter(), IP_ONLY, 12, exits)).toBe(12);
    expect(await send(newLimiter(), BY_FINGERPRINT, 12, exits)).toBe(5);
  });
});

describe('5. Spoofed X-Forwarded-For (app incorrectly trusts the header)', () => {
  it('a forged client IP yields a fresh bucket every request (weakness)', async () => {
    // The adapter resolves ctx.ip from X-Forwarded-For; if the proxy chain is
    // untrusted, the attacker controls it. Simulate by varying ctx.ip.
    const spoofed = (i: number) => ctx({ ip: `203.0.113.${i}` });
    expect(await send(newLimiter(), IP_ONLY, 30, spoofed)).toBe(30);
  });

  it('keying by fingerprint or identity neutralises header spoofing (mitigation)', async () => {
    const spoofed = (i: number) => ctx({ ip: `203.0.113.${i}` });
    expect(await send(newLimiter(), BY_FINGERPRINT, 30, spoofed)).toBe(5);
  });
});

describe('6. Botnet where each device stays below the limit', () => {
  it('per-IP limit never trips when every bot is under it (weakness)', async () => {
    const limiter = newLimiter();
    // 100 bots, 4 requests each (limit is 5) => none blocked, 400 total hits.
    let allowed = 0;
    for (let bot = 0; bot < 100; bot++) {
      allowed += await send(limiter, IP_ONLY, 4, () => ctx({ ip: `172.16.${bot}.9` }));
    }
    expect(allowed).toBe(400);
  });

  it('a coarse route-wide limit caps aggregate volume (mitigation)', async () => {
    const limiter = newLimiter();
    // A shared key (e.g. keyBy route only) bounds total traffic to the endpoint.
    const routeWide: RateLimitOptions = { max: 50, window: '1m', keyBy: 'route' };
    let allowed = 0;
    for (let bot = 0; bot < 100; bot++) {
      allowed += await send(limiter, routeWide, 4, () => ctx({ ip: `172.16.${bot}.9` }));
    }
    expect(allowed).toBe(50); // aggregate cap reached regardless of source IPs
  });
});

describe('7. Mobile networks that frequently change IP', () => {
  it('CGNAT IP churn resets per-IP buckets (weakness); fingerprint is stable (mitigation)', async () => {
    const churn = (i: number) => ctx({ ip: `100.${64 + i}.0.1` });
    expect(await send(newLimiter(), IP_ONLY, 10, churn)).toBe(10);
    expect(await send(newLimiter(), BY_FINGERPRINT, 10, churn)).toBe(5);
  });
});

describe('8. Alternate between Wi-Fi and cellular', () => {
  it('two IPs double an IP-only budget (weakness)', async () => {
    const limiter = newLimiter();
    const wifi = ctx({ ip: '192.168.1.50' });
    const cell = ctx({ ip: '100.65.0.7' });
    let allowed = 0;
    for (let i = 0; i < 12; i++) {
      if ((await limiter.check(i % 2 ? wifi : cell, IP_ONLY)).allowed) allowed++;
    }
    expect(allowed).toBe(10); // 5 per IP across the two networks
  });

  it('fingerprint keeps one budget for the device (mitigation)', async () => {
    const limiter = newLimiter();
    const wifi = ctx({ ip: '192.168.1.50' });
    const cell = ctx({ ip: '100.65.0.7' });
    let allowed = 0;
    for (let i = 0; i < 12; i++) {
      if ((await limiter.check(i % 2 ? wifi : cell, BY_FINGERPRINT)).allowed) allowed++;
    }
    expect(allowed).toBe(5);
  });
});

describe('9. Traffic from multiple cloud providers simultaneously', () => {
  it('distinct provider ranges each get a bucket (weakness); identity keying holds (mitigation)', async () => {
    const ranges = ['3.5', '13.59', '34.117', '20.62', '35.190']; // AWS/GCP/Azure-ish
    const cloud = (i: number) => ctx({ ip: `${ranges[i % ranges.length]}.${i}.1` });
    expect(await send(newLimiter(), IP_ONLY, 25, cloud)).toBe(25);

    const byApiKey: RateLimitOptions = { max: 5, window: '1m', keyBy: 'apiKey' };
    const allowed = await send(newLimiter(), byApiKey, 25, (i) => ({
      ...cloud(i),
      headers: { ...cloud(i).headers, 'x-api-key': 'leaked-key' },
    }));
    expect(allowed).toBe(5);
  });
});

describe('10. Low-and-slow (continue after the window expires)', () => {
  it('fixed window grants a fresh budget each window — within policy by design', async () => {
    const clock = new FakeClock(0);
    const limiter = newLimiter(clock);
    const opts: RateLimitOptions = { max: 5, window: '1m', keyBy: 'ip' };
    expect(await send(limiter, opts, 5, () => ctx())).toBe(5); // fill window 1
    expect((await limiter.check(ctx(), opts)).allowed).toBe(false); // 6th blocked
    clock.t = 60_001; // window elapses
    expect((await limiter.check(ctx(), opts)).allowed).toBe(true); // budget renews
  });

  it('token bucket also refills over time, but smooths bursts (mitigation choice)', async () => {
    const clock = new FakeClock(0);
    const limiter = newLimiter(clock);
    const opts: RateLimitOptions = { max: 5, window: '1m', keyBy: 'ip', algorithm: 'token-bucket' };
    expect(await send(limiter, opts, 5, () => ctx())).toBe(5);
    expect((await limiter.check(ctx(), opts)).allowed).toBe(false);
    // Only a fraction of the window has passed: one token (window/max = 12s) refills.
    clock.t = 12_000;
    expect((await limiter.check(ctx(), opts)).allowed).toBe(true);
    expect((await limiter.check(ctx(), opts)).allowed).toBe(false); // no second token yet
  });
});
