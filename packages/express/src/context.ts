import type { Request } from 'express';
import type { RequestContext } from '@sabrina-shield/core';

function normalizeHeaders(raw: Request['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

/** Map an Express request to the framework-neutral {@link RequestContext}. */
export function toRequestContext(req: Request): RequestContext {
  const headers = normalizeHeaders(req.headers);
  const forwarded = headers['x-forwarded-for'];
  const ip = forwarded
    ? forwarded.split(',')[0]!.trim()
    : (req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0');
  const contentLength = headers['content-length'] ? Number(headers['content-length']) : undefined;

  return {
    ip,
    method: (req.method ?? 'GET').toUpperCase(),
    path: (req.originalUrl ?? req.url ?? '/').split('?')[0]!,
    headers,
    userId: (req as { user?: { id?: string; userId?: string } }).user?.id,
    apiKey: headers['x-api-key'],
    routeKey: `${req.method} ${req.path ?? req.url}`,
    contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    raw: req,
  };
}
