/**
 * Framework-neutral view of an inbound HTTP request.
 *
 * Every framework adapter (NestJS, Express, Fastify) maps its native request to
 * this shape, and every core engine consumes ONLY this. It is the single seam
 * that keeps the core framework-agnostic.
 */
export interface RequestContext {
  /** Client IP address (already resolved past any trusted proxies). */
  ip: string;
  /** Uppercase HTTP method, e.g. `GET`. */
  method: string;
  /** Request path without query string, e.g. `/users`. */
  path: string;
  /** Lowercased header map. Multi-value headers are joined with `, `. */
  headers: Readonly<Record<string, string | undefined>>;
  /** Authenticated user id, if the app has already resolved one. */
  userId?: string;
  /** Resolved API key for this request, if any. */
  apiKey?: string;
  /** Logical route key (controller+handler) used for per-route limiting. */
  routeKey?: string;
  /** Declared body size in bytes, from `content-length` when present. */
  contentLength?: number;
  /** Escape hatch for adapter-specific data; engines should avoid relying on it. */
  raw?: unknown;
}

/** Read a single header case-insensitively from a {@link RequestContext}. */
export function getHeader(ctx: RequestContext, name: string): string | undefined {
  return ctx.headers[name.toLowerCase()];
}
