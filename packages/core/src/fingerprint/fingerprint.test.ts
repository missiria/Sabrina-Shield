import { describe, it, expect } from 'vitest';
import { generateFingerprint } from './fingerprint';
import type { RequestContext } from '../interfaces/request-context';

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  ip: '1.2.3.4',
  method: 'GET',
  path: '/x',
  headers: { 'user-agent': 'UA', 'accept-language': 'en' },
  ...over,
});

describe('generateFingerprint', () => {
  it('is stable for identical signals', () => {
    expect(generateFingerprint(ctx())).toBe(generateFingerprint(ctx()));
  });
  it('changes when a signal changes', () => {
    expect(generateFingerprint(ctx())).not.toBe(
      generateFingerprint(ctx({ headers: { 'user-agent': 'Other', 'accept-language': 'en' } })),
    );
  });
  it('can exclude IP from the hash', () => {
    const a = generateFingerprint(ctx({ ip: '1.1.1.1' }), { includeIp: false });
    const b = generateFingerprint(ctx({ ip: '2.2.2.2' }), { includeIp: false });
    expect(a).toBe(b);
  });
  it('returns a 64-char hex digest', () => {
    expect(generateFingerprint(ctx())).toMatch(/^[a-f0-9]{64}$/);
  });
});
