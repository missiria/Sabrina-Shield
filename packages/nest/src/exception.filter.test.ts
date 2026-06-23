import { describe, it, expect } from 'vitest';
import { RateLimitedError, ApiKeyInvalidError } from '@eksneks/core';
import { ShieldExceptionFilter } from './exception.filter';
import { makeRes } from './test-helpers';
import type { ArgumentsHost } from '@nestjs/common';

function host(res: unknown): ArgumentsHost {
  return { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
}

describe('ShieldExceptionFilter', () => {
  it('renders the standardized body with the error status', () => {
    const res = makeRes();
    new ShieldExceptionFilter().catch(new ApiKeyInvalidError(), host(res));
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      success: false,
      code: 'API_KEY_INVALID',
      message: 'Invalid or missing API key.',
    });
  });

  it('sets Retry-After for rate-limit errors', () => {
    const res = makeRes();
    new ShieldExceptionFilter().catch(new RateLimitedError(5000), host(res));
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('5');
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('supports a Fastify-style reply (code/send)', () => {
    let status = 0;
    let sent: unknown;
    const reply = {
      header() {},
      code(c: number) {
        status = c;
        return this;
      },
      send(b: unknown) {
        sent = b;
      },
    };
    new ShieldExceptionFilter().catch(new ApiKeyInvalidError(), host(reply));
    expect(status).toBe(401);
    expect(sent).toMatchObject({ code: 'API_KEY_INVALID' });
  });
});
