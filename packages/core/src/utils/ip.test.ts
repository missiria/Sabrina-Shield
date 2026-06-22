import { describe, it, expect } from 'vitest';
import { parseIp, normalizeIp, ipInCidr, ipInAny } from './ip';

describe('parseIp', () => {
  it('parses IPv4', () => {
    expect(parseIp('192.168.0.1')?.version).toBe(4);
    expect(parseIp('0.0.0.0')?.value).toBe(0n);
    expect(parseIp('255.255.255.255')?.value).toBe(0xffffffffn);
  });

  it('rejects bad IPv4', () => {
    expect(parseIp('256.0.0.1')).toBeNull();
    expect(parseIp('1.2.3')).toBeNull();
    expect(parseIp('a.b.c.d')).toBeNull();
  });

  it('parses IPv6 including :: expansion', () => {
    expect(parseIp('::1')?.value).toBe(1n);
    expect(parseIp('2001:db8::')?.version).toBe(6);
    expect(parseIp('fe80::1%eth0')?.value).toBe(parseIp('fe80::1')?.value);
  });

  it('parses IPv4-mapped IPv6', () => {
    expect(parseIp('::ffff:192.168.0.1')?.version).toBe(6);
  });

  it('rejects bad IPv6', () => {
    expect(parseIp('2001::db8::1')).toBeNull();
    expect(parseIp('gggg::1')).toBeNull();
  });
});

describe('normalizeIp', () => {
  it('collapses IPv4-mapped IPv6 to IPv4', () => {
    expect(normalizeIp('::ffff:192.168.0.1')).toBe('192.168.0.1');
  });

  it('leaves plain IPv4 untouched', () => {
    expect(normalizeIp('10.0.0.1')).toBe('10.0.0.1');
  });
});

describe('ipInCidr', () => {
  it('matches IPv4 CIDR', () => {
    expect(ipInCidr('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipInCidr('11.1.2.3', '10.0.0.0/8')).toBe(false);
    expect(ipInCidr('192.168.1.5', '192.168.1.0/24')).toBe(true);
    expect(ipInCidr('192.168.2.5', '192.168.1.0/24')).toBe(false);
  });

  it('matches a bare IP (implicit /32 or /128)', () => {
    expect(ipInCidr('10.0.0.1', '10.0.0.1')).toBe(true);
    expect(ipInCidr('10.0.0.2', '10.0.0.1')).toBe(false);
  });

  it('matches /0 always', () => {
    expect(ipInCidr('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('matches IPv6 CIDR', () => {
    expect(ipInCidr('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(ipInCidr('2001:dead::1', '2001:db8::/32')).toBe(false);
  });

  it('does not cross-match versions', () => {
    expect(ipInCidr('10.0.0.1', '2001:db8::/32')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(ipInCidr('not-an-ip', '10.0.0.0/8')).toBe(false);
    expect(ipInCidr('10.0.0.1', '10.0.0.0/99')).toBe(false);
  });
});

describe('ipInAny', () => {
  it('returns true if any entry matches', () => {
    expect(ipInAny('10.0.0.5', ['192.168.0.0/16', '10.0.0.0/8'])).toBe(true);
    expect(ipInAny('8.8.8.8', ['192.168.0.0/16', '10.0.0.0/8'])).toBe(false);
  });
});
