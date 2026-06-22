import { describe, it, expect } from 'vitest';
import { buildSecurityHeaders } from './headers';

describe('buildSecurityHeaders', () => {
  it('produces secure defaults', () => {
    const h = buildSecurityHeaders();
    expect(h['Content-Security-Policy']).toBe("default-src 'self'");
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    expect(h['Strict-Transport-Security']).toContain('max-age=');
    expect(h['Permissions-Policy']).toContain('geolocation=()');
  });

  it('allows disabling individual headers', () => {
    const h = buildSecurityHeaders({ hsts: false, frameOptions: false, xssProtection: false });
    expect(h['Strict-Transport-Security']).toBeUndefined();
    expect(h['X-Frame-Options']).toBeUndefined();
    expect(h['X-XSS-Protection']).toBeUndefined();
  });

  it('honors custom CSP and HSTS options', () => {
    const h = buildSecurityHeaders({
      contentSecurityPolicy: "default-src 'none'",
      hsts: { maxAge: 100, includeSubDomains: false, preload: true },
    });
    expect(h['Content-Security-Policy']).toBe("default-src 'none'");
    expect(h['Strict-Transport-Security']).toBe('max-age=100; preload');
  });
});
