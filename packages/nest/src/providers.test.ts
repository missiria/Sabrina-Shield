import { describe, it, expect } from 'vitest';
import {
  RateLimiter,
  ApiKeyValidator,
  AuditService,
  RiskEngine,
  BotDetector,
  IpBlocklist,
  RequestSizeGuard,
} from '@eksneks/core';
import { buildEngineProviders } from './providers';
import { TOKENS } from './constants';
import type { SabrinaShieldOptions } from './options';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function factory(token: string): (...args: any[]) => any {
  const providers = buildEngineProviders();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = providers.find((x) => (x as any).provide === token) as any;
  return p.useFactory;
}

describe('buildEngineProviders factories', () => {
  it('build engines when configured and undefined otherwise', () => {
    const full: SabrinaShieldOptions = {
      rateLimit: {},
      apiKeys: { keys: ['k'] },
      audit: true,
      bot: true,
      risk: { rules: [] },
      blocklist: { permanent: [] },
      requestSize: true,
    };
    expect(factory(TOKENS.rateLimiter)(full)).toBeInstanceOf(RateLimiter);
    expect(factory(TOKENS.apiKeyValidator)(full)).toBeInstanceOf(ApiKeyValidator);
    expect(factory(TOKENS.auditService)(full)).toBeInstanceOf(AuditService);
    expect(factory(TOKENS.botDetector)(full)).toBeInstanceOf(BotDetector);
    expect(factory(TOKENS.riskEngine)(full, new BotDetector())).toBeInstanceOf(RiskEngine);
    expect(factory(TOKENS.blocklist)(full)).toBeInstanceOf(IpBlocklist);
    expect(factory(TOKENS.requestSizeGuard)(full)).toBeInstanceOf(RequestSizeGuard);

    const empty: SabrinaShieldOptions = {};
    expect(factory(TOKENS.rateLimiter)(empty)).toBeUndefined();
    expect(factory(TOKENS.apiKeyValidator)(empty)).toBeUndefined();
    expect(factory(TOKENS.auditService)(empty)).toBeUndefined();
    expect(factory(TOKENS.botDetector)(empty)).toBeUndefined();
    expect(factory(TOKENS.riskEngine)(empty, undefined)).toBeUndefined();
    expect(factory(TOKENS.blocklist)(empty)).toBeUndefined();
    expect(factory(TOKENS.requestSizeGuard)(empty)).toBeUndefined();
  });

  it('audit accepts an explicit sink and geoProvider passes through', () => {
    const sink = { emit: () => {} };
    expect(factory(TOKENS.auditService)({ audit: { sink } })).toBeInstanceOf(AuditService);
    const geo = { lookup: () => ({}) };
    expect(factory(TOKENS.geoProvider)({ geoProvider: geo })).toBe(geo);
  });
});
