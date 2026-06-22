import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import {
  RateLimiter,
  ApiKeyValidator,
  BotDetector,
  IpBlocklist,
  RequestSizeGuard,
  buildSecurityHeaders,
  toResponseBody,
  ShieldError,
  RateLimitedError,
  ApiKeyInvalidError,
  IpBlockedError,
  BotDetectedError,
  PayloadTooLargeError,
  MemoryStore,
  type RateLimitOptions,
  type RateLimitStore,
  type ApiKeyOptions,
  type BotDetectorOptions,
  type IpBlocklistOptions,
  type RequestSizeOptions,
  type SecurityHeadersOptions,
  type Clock,
} from '@sabrina-shield/core';
import { toRequestContext } from './context';

/** Wrap an async handler so thrown/rejected errors reach `next`. */
function wrap(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export interface RateLimitMiddlewareOptions extends RateLimitOptions {
  store?: RateLimitStore;
  clock?: Clock;
}

/** Rate-limit middleware. Sets `X-RateLimit-*` headers and rejects with 429. */
export function rateLimit(options: RateLimitMiddlewareOptions): RequestHandler {
  const limiter = new RateLimiter({
    store: options.store ?? new MemoryStore({ sweepIntervalMs: 30_000 }),
    clock: options.clock,
  });
  return wrap(async (req, res, next) => {
    const result = await limiter.check(toRequestContext(req), options);
    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      throw new RateLimitedError(result.retryAfterMs);
    }
    next();
  });
}

/** API key middleware. Rejects with 401 when the key is missing/invalid. */
export function apiKey(options: ApiKeyOptions): RequestHandler {
  const validator = new ApiKeyValidator(options);
  return wrap(async (req, _res, next) => {
    const result = await validator.validate(toRequestContext(req));
    if (!result.valid) throw new ApiKeyInvalidError();
    next();
  });
}

/** Apply security headers to every response. */
export function securityHeaders(options: SecurityHeadersOptions = {}): RequestHandler {
  const headers = buildSecurityHeaders(options);
  return (_req, res, next) => {
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    next();
  };
}

/** Block requests from blocklisted IPs/CIDRs. */
export function blocklist(options: IpBlocklistOptions = {}): RequestHandler {
  const list = new IpBlocklist(options);
  return wrap(async (req, _res, next) => {
    if (await list.isBlocked(toRequestContext(req).ip)) throw new IpBlockedError();
    next();
  });
}

/** Block automated clients via User-Agent signatures. */
export function botDetection(options: BotDetectorOptions = {}): RequestHandler {
  const detector = new BotDetector(options);
  return (req, _res, next) => {
    if (detector.detect(toRequestContext(req)).isBot) return next(new BotDetectedError());
    next();
  };
}

/** Reject payloads larger than the configured limit. */
export function requestSize(options: RequestSizeOptions = {}): RequestHandler {
  const guard = new RequestSizeGuard(options);
  return (req, _res, next) => {
    const result = guard.check(toRequestContext(req));
    if (!result.ok) return next(new PayloadTooLargeError(result.limit, { size: result.size }));
    next();
  };
}

/**
 * Error-handling middleware that renders any {@link ShieldError} as the
 * standardized JSON body. Register it after your routes. Non-shield errors are
 * passed through to the next handler.
 */
export function shieldErrorHandler(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (!(err instanceof ShieldError)) return next(err);
    const retry = err.metadata.retryAfterMs;
    if (typeof retry === 'number' && Number.isFinite(retry)) {
      res.setHeader('Retry-After', String(Math.ceil(retry / 1000)));
    }
    res.status(err.status).json(toResponseBody(err));
  };
}
