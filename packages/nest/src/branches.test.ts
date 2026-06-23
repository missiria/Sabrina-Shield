import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RateLimitedError } from '@eksneks/core';
import { Risk, Audit, AllowCountry, BlockCountry } from './decorators';
import { METADATA } from './constants';
import { toRequestContext } from './context';
import { ShieldExceptionFilter } from './exception.filter';
import { SabrinaShieldModule } from './module';
import { TOKENS } from './constants';
import { makeExecCtx, makeReq } from './test-helpers';
import type { ArgumentsHost } from '@nestjs/common';

describe('decorator default arguments', () => {
  const reflector = new Reflector();
  class D {
    @Risk()
    @Audit()
    @AllowCountry('US')
    @BlockCountry('KP')
    m() {}
  }
  it('use sensible defaults', () => {
    const fn = D.prototype.m;
    expect(reflector.get(METADATA.risk, fn)).toBe(true);
    expect(reflector.get(METADATA.audit, fn)).toBe(true);
    expect(reflector.get(METADATA.allowCountry, fn)).toEqual(['US']);
    expect(reflector.get(METADATA.blockCountry, fn)).toEqual(['KP']);
  });
});

describe('context fallbacks', () => {
  it('falls back to socket address and user.userId', () => {
    const req = makeReq({
      ip: undefined,
      socket: { remoteAddress: '7.7.7.7' },
      user: { userId: 'u9' },
    });
    const ctx = toRequestContext(makeExecCtx(req, {}));
    expect(ctx.ip).toBe('7.7.7.7');
    expect(ctx.userId).toBe('u9');
    expect(ctx.contentLength).toBeUndefined();
  });

  it('defaults to 0.0.0.0 when nothing is available', () => {
    const ctx = toRequestContext(makeExecCtx({ headers: {} }, {}));
    expect(ctx.ip).toBe('0.0.0.0');
  });
});

describe('exception filter header path + infinite retry', () => {
  function host(res: unknown): ArgumentsHost {
    return { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  }

  it('uses res.header for Retry-After and skips infinite values', () => {
    const headers: Record<string, string> = {};
    const res = {
      header: (n: string, v: string) => (headers[n] = v),
      status() {
        return this;
      },
      json() {},
    };
    new ShieldExceptionFilter().catch(new RateLimitedError(3000), host(res));
    expect(headers['Retry-After']).toBe('3');

    // Infinite retryAfter must not set the header.
    const res2 = {
      headers: {} as Record<string, string>,
      setHeader(n: string, v: string) {
        this.headers[n] = v;
      },
      status() {
        return this;
      },
      json() {},
    };
    new ShieldExceptionFilter().catch(new RateLimitedError(Number.POSITIVE_INFINITY), host(res2));
    expect(res2.headers['Retry-After']).toBeUndefined();
  });
});

describe('forRootAsync without imports/inject', () => {
  it('defaults imports and inject to empty arrays', () => {
    const mod = SabrinaShieldModule.forRootAsync({ useFactory: () => ({}) });
    expect(mod.imports).toEqual([]);
    const optionProvider = mod.providers!.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => p.provide === TOKENS.options,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    expect(optionProvider.inject).toEqual([]);
  });
});
