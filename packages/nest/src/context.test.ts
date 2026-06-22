import { describe, it, expect } from 'vitest';
import { toRequestContext, setResponseHeader } from './context';
import { makeExecCtx, makeReq, makeRes } from './test-helpers';

describe('toRequestContext', () => {
  it('maps an Express-like request', () => {
    const req = makeReq({
      method: 'post',
      originalUrl: '/users?q=1',
      headers: { 'content-length': '42', 'x-api-key': 'k', 'user-agent': 'UA' },
      user: { id: 'u1' },
    });
    const ctx = toRequestContext(makeExecCtx(req, makeRes()));
    expect(ctx.method).toBe('POST');
    expect(ctx.path).toBe('/users');
    expect(ctx.contentLength).toBe(42);
    expect(ctx.apiKey).toBe('k');
    expect(ctx.userId).toBe('u1');
    expect(ctx.routeKey).toContain('Test');
  });

  it('prefers x-forwarded-for for the IP', () => {
    const req = makeReq({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } });
    expect(toRequestContext(makeExecCtx(req, makeRes())).ip).toBe('9.9.9.9');
  });

  it('joins array header values', () => {
    const req = makeReq({ headers: { 'set-cookie': ['a=1', 'b=2'] } });
    expect(toRequestContext(makeExecCtx(req, makeRes())).headers['set-cookie']).toBe('a=1, b=2');
  });
});

describe('setResponseHeader', () => {
  it('uses res.header when present, else setHeader', () => {
    const withHeader = { header: (n: string, v: string) => ((withHeader as any)[n] = v) } as any;
    setResponseHeader(makeExecCtx(makeReq(), withHeader), 'X', '1');
    expect(withHeader.X).toBe('1');

    const res = makeRes();
    setResponseHeader(makeExecCtx(makeReq(), res), 'Y', '2');
    expect(res.headers.Y).toBe('2');
  });
});
