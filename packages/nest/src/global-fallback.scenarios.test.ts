/**
 * Security scenarios — "Global Limit Fallback": find routes without protection.
 *
 * A common gap is a new/forgotten endpoint that nobody annotated with
 * `@RateLimit`. The module's `rateLimit.default` closes that gap: the guard
 * applies it to ANY route that lacks an explicit limit (and isn't `@Public` /
 * `@NoRateLimit`). These tests prove the default reaches every category of
 * endpoint and that, without a default, such routes are unbounded.
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RateLimiter, MemoryStore } from '@eksneks/core';
import { ShieldGuard } from './shield.guard';
import { makeExecCtx, makeReq, makeRes } from './test-helpers';

const reflector = new Reflector();
const clock = { now: () => 0 };

function guardWithDefault(max: number | null) {
  const options = max == null ? {} : { rateLimit: { default: { max, window: '1m' as const } } };
  const rateLimiter = new RateLimiter({ store: new MemoryStore(), clock });
  return new ShieldGuard(
    reflector,
    options,
    rateLimiter,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );
}

// Undecorated handlers representing every "easy to forget" endpoint category.
class UnprotectedRoutes {
  newlyAdded() {}
  healthCheck() {}
  metrics() {}
  adminUsers() {}
  graphql() {}
  fileUpload() {}
  fileDownload() {}
  webhook() {}
  staticData() {}
  deprecatedV1() {}
}

type Handler = () => void;
const ALL: [string, Handler][] = Object.getOwnPropertyNames(UnprotectedRoutes.prototype)
  .filter((n) => n !== 'constructor')
  .map((n) => [n, (UnprotectedRoutes.prototype as Record<string, Handler>)[n]!]);

async function allowedCount(guard: ShieldGuard, handler: Handler, n: number): Promise<number> {
  let allowed = 0;
  for (let i = 0; i < n; i++) {
    try {
      await guard.canActivate(makeExecCtx(makeReq(), makeRes(), handler, UnprotectedRoutes));
      allowed++;
    } catch {
      /* blocked by a ShieldError */
    }
  }
  return allowed;
}

describe('Global default protects every unannotated endpoint category', () => {
  it.each(ALL)('caps the undecorated %s route at the module default', async (_name, handler) => {
    const guard = guardWithDefault(3);
    expect(await allowedCount(guard, handler, 5)).toBe(3);
  });
});

describe('Without a default, unannotated routes are unbounded (the gap)', () => {
  it('a newly added route with no limit and no default is never throttled', async () => {
    const guard = guardWithDefault(null);
    expect(await allowedCount(guard, UnprotectedRoutes.prototype.newlyAdded, 100)).toBe(100);
  });

  it('configuring a default immediately closes the gap', async () => {
    const guard = guardWithDefault(10);
    expect(await allowedCount(guard, UnprotectedRoutes.prototype.newlyAdded, 100)).toBe(10);
  });
});
