import { describe, it, expect } from 'vitest';
import { BotDetector } from './bot/bot-detector';
import { IpBlocklist } from './blocklist/blocklist';
import { RequestSizeGuard } from './request-size/request-size';
import { AbuseDetector, defaultAbuseRules } from './abuse/abuse-detector';
import { MemoryStore } from '../cache/memory-store';
import type { RequestContext } from '../interfaces/request-context';

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  ip: '1.2.3.4',
  method: 'GET',
  path: '/x',
  headers: {},
  ...over,
});

describe('BotDetector', () => {
  const detector = new BotDetector();
  it('flags known tools', () => {
    expect(detector.detect(ctx({ headers: { 'user-agent': 'curl/8.1.0' } })).isBot).toBe(true);
    expect(detector.detect(ctx({ headers: { 'user-agent': 'sqlmap/1.7' } })).signature?.name).toBe(
      'sqlmap',
    );
  });
  it('passes a normal browser UA', () => {
    expect(
      detector.detect(ctx({ headers: { 'user-agent': 'Mozilla/5.0 (Macintosh)' } })).isBot,
    ).toBe(false);
  });
  it('optionally blocks empty UA + supports custom signatures', () => {
    expect(new BotDetector({ blockEmptyUserAgent: true }).detect(ctx()).isBot).toBe(true);
    const d = new BotDetector({ extraSignatures: [{ name: 'evil', pattern: /evilbot/i }] });
    expect(d.detect(ctx({ headers: { 'user-agent': 'EvilBot/1' } })).signature?.name).toBe('evil');
  });
});

describe('IpBlocklist', () => {
  it('blocks permanent CIDRs and honors allowlist', async () => {
    const bl = new IpBlocklist({ permanent: ['10.0.0.0/8'], allow: ['10.1.1.1'] });
    expect(await bl.isBlocked('10.2.3.4')).toBe(true);
    expect(await bl.isBlocked('10.1.1.1')).toBe(false); // allowlist wins
    expect(await bl.isBlocked('8.8.8.8')).toBe(false);
  });
  it('supports temporary blocks via store', async () => {
    const bl = new IpBlocklist({ store: new MemoryStore() });
    await bl.block('9.9.9.9', 10_000);
    expect(await bl.isBlocked('9.9.9.9')).toBe(true);
    await bl.unblock('9.9.9.9');
    expect(await bl.isBlocked('9.9.9.9')).toBe(false);
  });
});

describe('RequestSizeGuard', () => {
  it('rejects oversized bodies and picks type-specific limits', () => {
    const guard = new RequestSizeGuard({ maxBodyBytes: 100, maxJsonBytes: 10 });
    expect(guard.check(ctx({ contentLength: 50 })).ok).toBe(true);
    expect(guard.check(ctx({ contentLength: 200 })).ok).toBe(false);
    const json = ctx({ headers: { 'content-type': 'application/json' }, contentLength: 50 });
    expect(guard.check(json).ok).toBe(false); // exceeds the 10-byte JSON limit
  });
  it('reads content-length header when not pre-parsed', () => {
    const guard = new RequestSizeGuard({ maxBodyBytes: 10 });
    expect(guard.check(ctx({ headers: { 'content-length': '20' } })).ok).toBe(false);
  });
});

describe('AbuseDetector', () => {
  it('trips after exceeding the threshold', async () => {
    const detector = new AbuseDetector({ store: new MemoryStore(), rules: defaultAbuseRules() });
    let result;
    for (let i = 0; i < 6; i++) result = await detector.record('brute-force', ctx());
    expect(result!.abusive).toBe(true);
    expect(result!.count).toBe(6);
  });
  it('check is read-only', async () => {
    const detector = new AbuseDetector({ store: new MemoryStore(), rules: defaultAbuseRules() });
    await detector.record('spam', ctx());
    const r = await detector.check('spam', ctx());
    expect(r.count).toBe(1);
    expect(r.abusive).toBe(false);
  });
  it('throws on unknown rule', async () => {
    const detector = new AbuseDetector({ store: new MemoryStore(), rules: {} });
    await expect(detector.record('nope', ctx())).rejects.toThrow();
  });
});
