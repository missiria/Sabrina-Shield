/**
 * Security scenarios — "Disabled Route Limit": ensure exclusions stay safe.
 *
 * `@Public` / `@NoRateLimit` deliberately exempt a route from rate limiting.
 * The risks are (a) the exemption being abused for DoS and (b) it leaking to
 * routes that should stay protected. These tests prove the exemption is
 * resolved from handler/class metadata (not the URL string), so path/alias/
 * method tricks can't forge it; that a non-exempt sibling stays capped; and —
 * crucially — that exemption is rate-limit-only: blocklist and bot detection
 * still run, so an "open" route is not an open door.
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import {
  RateLimiter,
  MemoryStore,
  IpBlocklist,
  BotDetector,
  IpBlockedError,
  BotDetectedError,
} from '@eksneks/core';
import { ShieldGuard } from './shield.guard';
import { RateLimit, NoRateLimit, Public } from './decorators';
import { makeExecCtx, makeReq, makeRes } from './test-helpers';

const reflector = new Reflector();
const clock = { now: () => 0 };

class Routes {
  @RateLimit({ max: 2, window: '1m' })
  limited() {}

  @NoRateLimit()
  noLimit() {}

  @Public()
  pub() {}

  // No decorator → falls back to the module default.
  internal() {}

  wildcard() {}
}

@Public()
class PublicController {
  anything() {}
}

type Handler = () => void;

function guard(deps: { blocklist?: IpBlocklist; bot?: BotDetector } = {}) {
  const options = { rateLimit: { default: { max: 2, window: '1m' as const } } };
  const rateLimiter = new RateLimiter({ store: new MemoryStore(), clock });
  return new ShieldGuard(
    reflector,
    options,
    rateLimiter,
    undefined,
    undefined,
    undefined,
    deps.bot,
    deps.blocklist,
    undefined,
    undefined,
  );
}

async function allowed(
  g: ShieldGuard,
  handler: Handler,
  cls: new () => unknown,
  n: number,
  req = makeReq(),
): Promise<number> {
  let count = 0;
  for (let i = 0; i < n; i++) {
    try {
      await g.canActivate(makeExecCtx(req, makeRes(), handler, cls));
      count++;
    } catch {
      /* blocked */
    }
  }
  return count;
}

describe('1. Abuse a public endpoint for DoS', () => {
  it('@NoRateLimit and @Public routes are unbounded by design (documented risk)', async () => {
    expect(await allowed(guard(), Routes.prototype.noLimit, Routes, 100)).toBe(100);
    expect(await allowed(guard(), Routes.prototype.pub, Routes, 100)).toBe(100);
  });

  it('but bot detection still runs on exempt routes (mitigation)', async () => {
    const g = guard({ bot: new BotDetector() });
    const attack = makeReq({ headers: { 'user-agent': 'sqlmap/1.7' } });
    await expect(
      g.canActivate(makeExecCtx(attack, makeRes(), Routes.prototype.pub, Routes)),
    ).rejects.toBeInstanceOf(BotDetectedError);
  });
});

describe('2 & 10. Forgotten exclusions / internal endpoints accidentally exposed', () => {
  it('a route without @Public/@NoRateLimit is NOT implicitly exempt', async () => {
    expect(await allowed(guard(), Routes.prototype.internal, Routes, 5)).toBe(2); // default cap
  });
});

describe('3, 4, 6. Alias / path-normalization / reverse-proxy tricks', () => {
  it('exemption is keyed to the handler, not the URL — a limited handler stays limited at any path', async () => {
    const g = guard();
    // Attacker hits the limited handler but spoofs the public route's path.
    const spoof = makeReq({ url: '/pub', originalUrl: '/pub/' });
    expect(await allowed(g, Routes.prototype.limited, Routes, 5, spoof)).toBe(2);
  });

  it('a public handler does not lend its exemption to a sibling handler', async () => {
    const g = guard();
    // pub is exempt…
    expect(await allowed(g, Routes.prototype.pub, Routes, 10)).toBe(10);
    // …but internal (sibling, same controller) is still capped.
    expect(await allowed(g, Routes.prototype.internal, Routes, 10)).toBe(2);
  });
});

describe('5. HTTP method differences', () => {
  it('exemption holds across methods for the exempt handler; limits hold for the limited one', async () => {
    const g = guard();
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const req = makeReq({ method });
      expect(await allowed(g, Routes.prototype.pub, Routes, 3, req)).toBe(3); // always exempt
    }
    expect(
      await allowed(g, Routes.prototype.limited, Routes, 5, makeReq({ method: 'PATCH' })),
    ).toBe(2);
  });
});

describe('7. Nested routers / class-level exclusion', () => {
  it('a class-level @Public exempts every handler in that controller (scope carefully)', async () => {
    const g = guard();
    expect(await allowed(g, PublicController.prototype.anything, PublicController, 100)).toBe(100);
  });
});

describe('8. Wildcard routes', () => {
  it('a wildcard handler without an exemption still gets the default cap', async () => {
    expect(await allowed(guard(), Routes.prototype.wildcard, Routes, 5)).toBe(2);
  });
});

describe('9. Middleware ordering issues', () => {
  it('blocklist runs before the rate-limit skip — @NoRateLimit does not disable IP blocking', async () => {
    const g = guard({ blocklist: new IpBlocklist({ permanent: ['1.2.3.4'] }) });
    await expect(
      g.canActivate(makeExecCtx(makeReq(), makeRes(), Routes.prototype.noLimit, Routes)),
    ).rejects.toBeInstanceOf(IpBlockedError);
  });
});
