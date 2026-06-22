import { describe, it, expect } from 'vitest';
import { RiskEngine } from './risk-engine';
import {
  torExitNodeRule,
  vpnRule,
  badUserAgentRule,
  blockedCountryRule,
  knownScannerRule,
} from './rules';
import { BotDetector } from '../security/bot/bot-detector';
import type { GeoProvider } from '../interfaces/geo';
import type { RequestContext } from '../interfaces/request-context';

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  ip: '1.2.3.4',
  method: 'GET',
  path: '/x',
  headers: {},
  ...over,
});

describe('RiskEngine', () => {
  it('sums rule scores and blocks at threshold', async () => {
    const geo: GeoProvider = { lookup: () => ({ tor: true, vpn: true, country: 'KP' }) };
    const engine = new RiskEngine({
      geoProvider: geo,
      threshold: 100,
      rules: [torExitNodeRule(40), vpnRule(15), blockedCountryRule(['KP'], 100)],
    });
    const result = await engine.assess(ctx());
    expect(result.score).toBe(155);
    expect(result.blocked).toBe(true);
    expect(result.breakdown.map((b) => b.rule)).toContain('tor-exit-node');
  });

  it('does not block below threshold', async () => {
    const engine = new RiskEngine({ rules: [badUserAgentRule(20)], threshold: 100 });
    const result = await engine.assess(ctx({ headers: { 'user-agent': '' } }));
    expect(result.score).toBe(20);
    expect(result.blocked).toBe(false);
  });

  it('uses bot detector for the scanner rule', async () => {
    const engine = new RiskEngine({
      botDetector: new BotDetector(),
      threshold: 25,
      rules: [knownScannerRule(30)],
    });
    const result = await engine.assess(ctx({ headers: { 'user-agent': 'sqlmap/1.0' } }));
    expect(result.blocked).toBe(true);
  });
});
