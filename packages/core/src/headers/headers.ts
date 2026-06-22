export interface SecurityHeadersOptions {
  /** Content-Security-Policy. `false` disables; string sets verbatim. */
  contentSecurityPolicy?: string | false;
  /** Strict-Transport-Security. `false` disables. */
  hsts?: { maxAge?: number; includeSubDomains?: boolean; preload?: boolean } | false;
  /** X-Frame-Options (default `DENY`). `false` disables. */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | false;
  /** Referrer-Policy (default `no-referrer`). `false` disables. */
  referrerPolicy?: string | false;
  /** Permissions-Policy. `false` disables. */
  permissionsPolicy?: string | false;
  /** X-Content-Type-Options: nosniff (default true). */
  noSniff?: boolean;
  /** Legacy X-XSS-Protection (default `0`, modern guidance). `false` omits. */
  xssProtection?: string | false;
}

const DEFAULT_CSP = "default-src 'self'";
const DEFAULT_PERMISSIONS = 'camera=(), microphone=(), geolocation=()';

/**
 * Build a map of secure-by-default HTTP response headers. Every entry is
 * overridable, and any header can be disabled with `false`. Pure function —
 * adapters apply the returned map to their response object.
 */
export function buildSecurityHeaders(options: SecurityHeadersOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {};

  if (options.contentSecurityPolicy !== false) {
    headers['Content-Security-Policy'] = options.contentSecurityPolicy ?? DEFAULT_CSP;
  }

  if (options.hsts !== false) {
    const hsts = options.hsts ?? {};
    const maxAge = hsts.maxAge ?? 15_552_000; // 180 days
    let value = `max-age=${maxAge}`;
    if (hsts.includeSubDomains ?? true) value += '; includeSubDomains';
    if (hsts.preload) value += '; preload';
    headers['Strict-Transport-Security'] = value;
  }

  if (options.frameOptions !== false) {
    headers['X-Frame-Options'] = options.frameOptions ?? 'DENY';
  }

  if (options.referrerPolicy !== false) {
    headers['Referrer-Policy'] = options.referrerPolicy ?? 'no-referrer';
  }

  if (options.permissionsPolicy !== false) {
    headers['Permissions-Policy'] = options.permissionsPolicy ?? DEFAULT_PERMISSIONS;
  }

  if (options.noSniff ?? true) {
    headers['X-Content-Type-Options'] = 'nosniff';
  }

  if (options.xssProtection !== false) {
    headers['X-XSS-Protection'] = options.xssProtection ?? '0';
  }

  return headers;
}
