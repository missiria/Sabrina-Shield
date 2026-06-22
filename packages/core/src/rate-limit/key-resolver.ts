import { getHeader, type RequestContext } from '../interfaces/request-context';
import { normalizeIp } from '../utils/ip';
import { generateFingerprint } from '../fingerprint/fingerprint';
import type { RateLimitKeyBy, RateLimitOptions } from './types';

/**
 * Build a stable rate-limit key from a {@link RequestContext} according to the
 * configured dimensions. Unknown values fall back to `'-'` so a missing user id
 * does not collapse every anonymous client onto one key unexpectedly (the `ip`
 * dimension should be combined when keying by user).
 */
export function resolveKey(ctx: RequestContext, options: RateLimitOptions): string {
  const dims: RateLimitKeyBy[] = Array.isArray(options.keyBy)
    ? options.keyBy
    : [options.keyBy ?? 'ip'];

  const parts = dims.map((dim) => `${dim}=${resolveDimension(dim, ctx, options)}`);
  const prefix = options.prefix ? `${options.prefix}:` : '';
  return prefix + parts.join('|');
}

function resolveDimension(
  dim: RateLimitKeyBy,
  ctx: RequestContext,
  options: RateLimitOptions,
): string {
  switch (dim) {
    case 'ip':
      return normalizeIp(ctx.ip) || '-';
    case 'user':
      return ctx.userId ?? '-';
    case 'apiKey':
      return ctx.apiKey ?? getHeader(ctx, 'x-api-key') ?? '-';
    case 'route':
      return ctx.routeKey ?? `${ctx.method} ${ctx.path}`;
    case 'header':
      return (options.header ? getHeader(ctx, options.header) : undefined) ?? '-';
    case 'fingerprint':
      return generateFingerprint(ctx);
    default:
      return '-';
  }
}
