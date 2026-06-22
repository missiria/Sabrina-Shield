import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import {
  RateLimiter,
  ApiKeyValidator,
  BotDetector,
  IpBlocklist,
  RiskEngine,
  RequestSizeGuard,
  AuditService,
  MemoryStore,
  RateLimitedError,
  ApiKeyInvalidError,
  IpBlockedError,
  BotDetectedError,
  RoleForbiddenError,
  RiskThresholdError,
  CountryBlockedError,
  PayloadTooLargeError,
  badUserAgentRule,
  type AuditEvent,
  type AuditSink,
  type GeoProvider,
} from '@sabrina-shield/core';
import { ShieldGuard } from './shield.guard';
import { RateLimit, ApiKey, Public, RequireRole, BlockIp, Risk, BlockCountry } from './decorators';
import { makeExecCtx, makeReq, makeRes } from './test-helpers';

class Routes {
  @RateLimit({ max: 1, window: '1m' })
  limited() {}

  @ApiKey()
  secured() {}

  @RequireRole('admin')
  adminOnly() {}

  @BlockIp('10.0.0.0/8')
  geofenced() {}

  @Public()
  @ApiKey()
  publicButSecured() {}

  @Risk({ threshold: 10 })
  risky() {}

  @BlockCountry('KP')
  countryFenced() {}

  plain() {}
}

const reflector = new Reflector();
const clock = { now: () => 0 };

interface GuardDeps {
  rateLimiter?: RateLimiter;
  apiKeys?: ApiKeyValidator;
  bot?: BotDetector;
  blocklist?: IpBlocklist;
  risk?: RiskEngine;
  requestSize?: RequestSizeGuard;
  audit?: AuditService;
  geo?: GeoProvider;
}

function guardWith(deps: GuardDeps = {}) {
  return new ShieldGuard(
    reflector,
    undefined, // options
    deps.rateLimiter,
    deps.apiKeys,
    deps.audit,
    deps.risk,
    deps.bot,
    deps.blocklist,
    deps.requestSize,
    deps.geo,
  );
}

describe('ShieldGuard — rate limiting', () => {
  it('allows up to the limit, sets headers, then throws', async () => {
    const guard = guardWith({ rateLimiter: new RateLimiter({ store: new MemoryStore(), clock }) });
    const res = makeRes();
    const ctx = makeExecCtx(makeReq(), res, Routes.prototype.limited, Routes);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(res.headers['X-RateLimit-Limit']).toBe('1');
    expect(res.headers['X-RateLimit-Remaining']).toBe('0');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('skips rate limiting on @Public routes', async () => {
    const guard = guardWith({ rateLimiter: new RateLimiter({ store: new MemoryStore(), clock }) });
    const ctx = makeExecCtx(makeReq(), makeRes(), Routes.prototype.plain, Routes);
    expect(await guard.canActivate(ctx)).toBe(true); // no @RateLimit, no default => allowed
  });
});

describe('ShieldGuard — api key', () => {
  it('rejects missing key on @ApiKey route', async () => {
    const guard = guardWith({ apiKeys: new ApiKeyValidator({ keys: ['good'] }) });
    const ctx = makeExecCtx(makeReq(), makeRes(), Routes.prototype.secured, Routes);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ApiKeyInvalidError);
  });
  it('accepts a valid key', async () => {
    const guard = guardWith({ apiKeys: new ApiKeyValidator({ keys: ['good'] }) });
    const req = makeReq({ headers: { 'x-api-key': 'good' } });
    const ctx = makeExecCtx(req, makeRes(), Routes.prototype.secured, Routes);
    expect(await guard.canActivate(ctx)).toBe(true);
  });
  it('skips api key enforcement on @Public routes', async () => {
    const guard = guardWith({ apiKeys: new ApiKeyValidator({ keys: ['good'] }) });
    const ctx = makeExecCtx(makeReq(), makeRes(), Routes.prototype.publicButSecured, Routes);
    expect(await guard.canActivate(ctx)).toBe(true);
  });
});

describe('ShieldGuard — blocklist, bot, role', () => {
  it('blocks per-route @BlockIp matches', async () => {
    const guard = guardWith({});
    const req = makeReq({ ip: '10.1.2.3' });
    const ctx = makeExecCtx(req, makeRes(), Routes.prototype.geofenced, Routes);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(IpBlockedError);
  });

  it('blocks globally blocklisted IPs', async () => {
    const guard = guardWith({ blocklist: new IpBlocklist({ permanent: ['1.2.3.4'] }) });
    const ctx = makeExecCtx(makeReq(), makeRes(), Routes.prototype.plain, Routes);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(IpBlockedError);
  });

  it('blocks detected bots', async () => {
    const guard = guardWith({ bot: new BotDetector() });
    const req = makeReq({ headers: { 'user-agent': 'sqlmap/1.0' } });
    const ctx = makeExecCtx(req, makeRes(), Routes.prototype.plain, Routes);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(BotDetectedError);
  });

  it('enforces @RequireRole against req.user.roles', async () => {
    const guard = guardWith({});
    const denied = makeExecCtx(makeReq(), makeRes(), Routes.prototype.adminOnly, Routes);
    await expect(guard.canActivate(denied)).rejects.toBeInstanceOf(RoleForbiddenError);
    const allowed = makeExecCtx(
      makeReq({ user: { roles: ['admin'] } }),
      makeRes(),
      Routes.prototype.adminOnly,
      Routes,
    );
    expect(await guard.canActivate(allowed)).toBe(true);
  });
});

describe('ShieldGuard — risk, country, size, audit', () => {
  it('blocks when the per-route risk threshold is exceeded', async () => {
    const risk = new RiskEngine({ rules: [badUserAgentRule(20)], threshold: 100 });
    const guard = guardWith({ risk });
    const req = makeReq({ headers: { 'user-agent': '' } }); // bad UA => 20 >= route threshold 10
    const ctx = makeExecCtx(req, makeRes(), Routes.prototype.risky, Routes);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(RiskThresholdError);
  });

  it('blocks a @BlockCountry match using the geo provider', async () => {
    const geo: GeoProvider = { lookup: () => ({ country: 'KP' }) };
    const guard = guardWith({ geo });
    const ctx = makeExecCtx(makeReq(), makeRes(), Routes.prototype.countryFenced, Routes);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(CountryBlockedError);
  });

  it('allows a non-blocked country', async () => {
    const geo: GeoProvider = { lookup: () => ({ country: 'US' }) };
    const guard = guardWith({ geo });
    const ctx = makeExecCtx(makeReq(), makeRes(), Routes.prototype.countryFenced, Routes);
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('rejects oversized payloads', async () => {
    const guard = guardWith({ requestSize: new RequestSizeGuard({ maxBodyBytes: 10 }) });
    const req = makeReq({ headers: { 'content-length': '999' } });
    const ctx = makeExecCtx(req, makeRes(), Routes.prototype.plain, Routes);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('emits an audit event when a request is blocked', async () => {
    const events: AuditEvent[] = [];
    const sink: AuditSink = { emit: (e) => void events.push(e) };
    const guard = guardWith({
      audit: new AuditService({ sink, clock }),
      blocklist: new IpBlocklist({ permanent: ['1.2.3.4'] }),
    });
    const ctx = makeExecCtx(makeReq(), makeRes(), Routes.prototype.plain, Routes);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(IpBlockedError);
    expect(events.map((e) => e.type)).toContain('IP_BLOCKED');
  });
});
