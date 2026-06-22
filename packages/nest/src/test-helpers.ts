import type { ExecutionContext } from '@nestjs/common';

export interface FakeRes {
  headers: Record<string, string>;
  statusCode?: number;
  body?: unknown;
  setHeader(name: string, value: string): void;
  status(code: number): FakeRes;
  json(body: unknown): void;
}

export function makeRes(): FakeRes {
  const res: FakeRes = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  return res;
}

export function makeExecCtx(
  req: Record<string, unknown>,
  res: unknown,
  handler: (...args: unknown[]) => unknown = () => undefined,
  cls: new () => unknown = class Test {},
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

export function makeReq(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ip: '1.2.3.4',
    method: 'GET',
    url: '/x',
    headers: {},
    ...over,
  };
}
