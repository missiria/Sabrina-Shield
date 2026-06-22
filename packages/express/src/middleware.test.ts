import { describe, it, expect, vi } from 'vitest';
import {
  MemoryStore,
  RateLimitedError,
  ApiKeyInvalidError,
  IpBlockedError,
  BotDetectedError,
  PayloadTooLargeError,
} from '@sabrina-shield/core';
import {
  rateLimit,
  apiKey,
  securityHeaders,
  blocklist,
  botDetection,
  requestSize,
  shieldErrorHandler,
} from './middleware';
import { toRequestContext } from './context';
import type { Request, Response } from 'express';

function makeReq(over: Record<string, unknown> = {}): Request {
  return {
    ip: '1.2.3.4',
    method: 'GET',
    url: '/x',
    originalUrl: '/x',
    path: '/x',
    headers: {},
    ...over,
  } as unknown as Request;
}
function makeRes() {
  const res = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: undefined as unknown,
    setHeader(n: string, v: string) {
      this.headers[n] = v;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
    },
  };
  return res as unknown as Response & {
    headers: Record<string, string>;
    statusCode: number;
    body: unknown;
  };
}
const tick = () => new Promise((r) => setImmediate(r));

describe('express context', () => {
  it('prefers x-forwarded-for then maps content-length', () => {
    const ctx = toRequestContext(
      makeReq({ headers: { 'x-forwarded-for': '9.9.9.9', 'content-length': '5' } }),
    );
    expect(ctx.ip).toBe('9.9.9.9');
    expect(ctx.contentLength).toBe(5);
  });

  it('uses req.ip when no forwarded header, and maps user/array headers', () => {
    const ctx = toRequestContext(
      makeReq({ ip: '5.5.5.5', headers: { 'set-cookie': ['a=1', 'b=2'] }, user: { id: 'u7' } }),
    );
    expect(ctx.ip).toBe('5.5.5.5');
    expect(ctx.headers['set-cookie']).toBe('a=1, b=2');
    expect(ctx.userId).toBe('u7');
    expect(ctx.contentLength).toBeUndefined();
  });

  it('falls back to socket.remoteAddress then 0.0.0.0', () => {
    expect(
      toRequestContext(makeReq({ ip: undefined, socket: { remoteAddress: '8.8.8.8' } })).ip,
    ).toBe('8.8.8.8');
    expect(toRequestContext(makeReq({ ip: undefined, socket: {} })).ip).toBe('0.0.0.0');
  });
});

describe('middleware default arguments construct', () => {
  it('build with no options', () => {
    expect(typeof securityHeaders()).toBe('function');
    expect(typeof blocklist()).toBe('function');
    expect(typeof botDetection()).toBe('function');
    expect(typeof requestSize()).toBe('function');
  });
});

describe('rateLimit middleware', () => {
  it('sets headers, calls next when allowed, throws when exceeded', async () => {
    const mw = rateLimit({
      max: 1,
      window: '1m',
      store: new MemoryStore(),
      clock: { now: () => 0 },
    });
    const res = makeRes();
    const next = vi.fn();
    mw(makeReq(), res, next);
    await tick();
    expect(next).toHaveBeenCalledWith();
    expect(res.headers['X-RateLimit-Limit']).toBe('1');

    const next2 = vi.fn();
    mw(makeReq(), res, next2);
    await tick();
    expect(next2.mock.calls[0][0]).toBeInstanceOf(RateLimitedError);
  });
});

describe('other middleware reject appropriately', () => {
  it('apiKey rejects missing key', async () => {
    const next = vi.fn();
    apiKey({ keys: ['k'] })(makeReq(), makeRes(), next);
    await tick();
    expect(next.mock.calls[0][0]).toBeInstanceOf(ApiKeyInvalidError);
  });

  it('blocklist rejects blocked IP', async () => {
    const next = vi.fn();
    blocklist({ permanent: ['1.2.3.4'] })(makeReq(), makeRes(), next);
    await tick();
    expect(next.mock.calls[0][0]).toBeInstanceOf(IpBlockedError);
  });

  it('botDetection rejects known tools', () => {
    const next = vi.fn();
    botDetection()(makeReq({ headers: { 'user-agent': 'sqlmap/1' } }), makeRes(), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(BotDetectedError);
  });

  it('requestSize rejects oversized payloads', () => {
    const next = vi.fn();
    requestSize({ maxBodyBytes: 1 })(
      makeReq({ headers: { 'content-length': '99' } }),
      makeRes(),
      next,
    );
    expect(next.mock.calls[0][0]).toBeInstanceOf(PayloadTooLargeError);
  });

  it('securityHeaders sets headers and continues', () => {
    const res = makeRes();
    const next = vi.fn();
    securityHeaders()(makeReq(), res, next);
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(next).toHaveBeenCalled();
  });
});

describe('shieldErrorHandler', () => {
  it('renders ShieldError as standardized JSON with Retry-After', () => {
    const res = makeRes();
    shieldErrorHandler()(new RateLimitedError(2000), makeReq(), res, vi.fn());
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('2');
    expect(res.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
  });

  it('passes non-shield errors through', () => {
    const next = vi.fn();
    const err = new Error('other');
    shieldErrorHandler()(err, makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(err);
  });
});
