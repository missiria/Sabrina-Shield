import { sha256 } from '../utils/hash';
import { getHeader, type RequestContext } from '../interfaces/request-context';

export interface FingerprintOptions {
  /** Header carrying a client timezone hint (default `x-timezone`). */
  timezoneHeader?: string;
  /** Header carrying optional screen hints (default `x-screen`). */
  screenHeader?: string;
  /** Include the client IP in the fingerprint (default true). */
  includeIp?: boolean;
}

/**
 * Generate a stable, anonymous device fingerprint from request signals.
 * No cookies required. The output is a SHA-256 hex digest, so raw signals are
 * never stored or exposed.
 */
export function generateFingerprint(ctx: RequestContext, options: FingerprintOptions = {}): string {
  const { timezoneHeader = 'x-timezone', screenHeader = 'x-screen', includeIp = true } = options;
  const parts = [
    includeIp ? ctx.ip : '',
    getHeader(ctx, 'accept-language') ?? '',
    getHeader(ctx, 'user-agent') ?? '',
    getHeader(ctx, timezoneHeader) ?? '',
    getHeader(ctx, screenHeader) ?? '',
  ];
  return sha256(parts.join('|'));
}
