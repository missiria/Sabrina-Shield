import { describe, it, expect } from 'vitest';
import { SecurityPipeline, type SecurityCheck } from './security-pipeline';
import { IpBlockedError, RateLimitedError } from '../errors/errors';
import type { RequestContext } from '../interfaces/request-context';

const ctx: RequestContext = { ip: '1.2.3.4', method: 'GET', path: '/x', headers: {} };

const pass = (name: string): SecurityCheck => ({ name, run: () => null });
const fail = (name: string, err: () => Error): SecurityCheck => ({
  name,
  run: () => err() as never,
});

describe('SecurityPipeline', () => {
  it('allows when every check passes', async () => {
    const decision = await new SecurityPipeline([pass('a'), pass('b')]).evaluate(ctx);
    expect(decision.allowed).toBe(true);
    expect(decision.trail).toHaveLength(2);
  });

  it('short-circuits on the first blocking check', async () => {
    const pipeline = new SecurityPipeline([
      pass('blocklist'),
      fail('rate-limit', () => new RateLimitedError(1000)),
      fail('ip', () => new IpBlockedError()),
    ]);
    const decision = await pipeline.evaluate(ctx);
    expect(decision.allowed).toBe(false);
    expect(decision.error).toBeInstanceOf(RateLimitedError);
    expect(decision.trail).toHaveLength(2); // stopped after the 2nd check
    expect(decision.trail.at(-1)).toEqual({ name: 'rate-limit', blocked: true });
  });
});
