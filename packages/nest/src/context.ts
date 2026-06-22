import type { ExecutionContext } from '@nestjs/common';
import type { RequestContext } from '@sabrina-shield/core';

/** Lowercase a header map whose values may be strings or string arrays. */
function normalizeHeaders(raw: Record<string, unknown> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

/** Best-effort client IP resolution across Express/Fastify request shapes. */
function resolveIp(req: Record<string, any>, headers: Record<string, string>): string {
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.ip ?? req.socket?.remoteAddress ?? req.raw?.ip ?? '0.0.0.0';
}

/**
 * Map a Nest {@link ExecutionContext} (over either Express or Fastify) to the
 * framework-neutral {@link RequestContext} the core engines consume.
 */
export function toRequestContext(execCtx: ExecutionContext): RequestContext {
  const http = execCtx.switchToHttp();
  const req = http.getRequest<Record<string, any>>();
  const headers = normalizeHeaders(req.headers);

  const handler = execCtx.getHandler?.();
  const cls = execCtx.getClass?.();
  const routeKey =
    cls && handler ? `${cls.name}.${handler.name}` : `${req.method} ${req.url ?? req.originalUrl}`;

  const contentLength = headers['content-length'] ? Number(headers['content-length']) : undefined;

  return {
    ip: resolveIp(req, headers),
    method: (req.method ?? 'GET').toUpperCase(),
    path: (req.originalUrl ?? req.url ?? '/').split('?')[0]!,
    headers,
    userId: req.user?.id ?? req.user?.userId,
    apiKey: headers['x-api-key'],
    routeKey,
    contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    raw: req,
  };
}

/** Set a response header on either an Express `res` or a Fastify `reply`. */
export function setResponseHeader(execCtx: ExecutionContext, name: string, value: string): void {
  const res = execCtx.switchToHttp().getResponse<Record<string, any>>();
  if (typeof res.header === 'function') res.header(name, value);
  else if (typeof res.setHeader === 'function') res.setHeader(name, value);
}
