import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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

export interface FastifyShieldOptions {
  rateLimit?: RateLimitOptions & { store?: RateLimitStore };
  apiKeys?: ApiKeyOptions;
  headers?: SecurityHeadersOptions | boolean;
  blocklist?: IpBlocklistOptions;
  bot?: BotDetectorOptions | boolean;
  requestSize?: RequestSizeOptions | boolean;
  clock?: Clock;
}

/**
 * Fastify plugin wiring Sabrina Shield protections via `onRequest` hooks and a
 * shared error handler that renders {@link ShieldError}s as the standardized
 * JSON body. Register with `app.register(sabrinaShield, options)`.
 */
export const sabrinaShield = fp<FastifyShieldOptions>(
  async (app: FastifyInstance, options: FastifyShieldOptions) => {
    const blocklist = options.blocklist ? new IpBlocklist(options.blocklist) : undefined;
    const bot = options.bot ? new BotDetector(options.bot === true ? {} : options.bot) : undefined;
    const requestSize = options.requestSize
      ? new RequestSizeGuard(options.requestSize === true ? {} : options.requestSize)
      : undefined;
    const apiKeys = options.apiKeys ? new ApiKeyValidator(options.apiKeys) : undefined;
    const rateLimiter = options.rateLimit
      ? new RateLimiter({
          store: options.rateLimit.store ?? new MemoryStore({ sweepIntervalMs: 30_000 }),
          clock: options.clock,
        })
      : undefined;
    const headers =
      options.headers === false || options.headers === undefined
        ? undefined
        : buildSecurityHeaders(options.headers === true ? {} : options.headers);

    app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      const ctx = toRequestContext(req);

      if (headers) {
        for (const [name, value] of Object.entries(headers)) reply.header(name, value);
      }
      if (blocklist && (await blocklist.isBlocked(ctx.ip))) throw new IpBlockedError();
      if (bot && bot.detect(ctx).isBot) throw new BotDetectedError();
      if (requestSize) {
        const result = requestSize.check(ctx);
        if (!result.ok) throw new PayloadTooLargeError(result.limit, { size: result.size });
      }
      if (apiKeys && !(await apiKeys.validate(ctx)).valid) throw new ApiKeyInvalidError();
      if (rateLimiter && options.rateLimit) {
        const result = await rateLimiter.check(ctx, options.rateLimit);
        reply.header('X-RateLimit-Limit', String(result.limit));
        reply.header('X-RateLimit-Remaining', String(result.remaining));
        reply.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
        if (!result.allowed) {
          reply.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
          throw new RateLimitedError(result.retryAfterMs);
        }
      }
    });

    app.setErrorHandler((error, _req, reply) => {
      if (error instanceof ShieldError) {
        const retry = error.metadata.retryAfterMs;
        if (typeof retry === 'number' && Number.isFinite(retry)) {
          reply.header('Retry-After', String(Math.ceil(retry / 1000)));
        }
        reply.status(error.status).send(toResponseBody(error));
        return;
      }
      reply.send(error);
    });
  },
  { name: 'sabrina-shield', fastify: '4.x || 5.x' },
);
