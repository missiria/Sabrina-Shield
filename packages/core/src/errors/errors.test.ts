import { describe, it, expect } from 'vitest';
import {
  RateLimitedError,
  ApiKeyInvalidError,
  IpBlockedError,
  RiskThresholdError,
  PayloadTooLargeError,
  ShieldError,
} from './index';
import { toResponseBody } from './to-response-body';

describe('ShieldError subclasses', () => {
  it('carry stable code + status + metadata', () => {
    const err = new RateLimitedError(5000, { key: 'ip:1.2.3.4' });
    expect(err).toBeInstanceOf(ShieldError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.status).toBe(429);
    expect(err.metadata.retryAfterMs).toBe(5000);
    expect(err.metadata.key).toBe('ip:1.2.3.4');
    expect(err.name).toBe('RateLimitedError');
  });

  it('expose correct status codes', () => {
    expect(new ApiKeyInvalidError().status).toBe(401);
    expect(new IpBlockedError().status).toBe(403);
    expect(new PayloadTooLargeError(1024).status).toBe(413);
    expect(new RiskThresholdError(120, 100).status).toBe(403);
  });

  it('RiskThresholdError records score + threshold', () => {
    const err = new RiskThresholdError(120, 100);
    expect(err.metadata).toMatchObject({ score: 120, threshold: 100 });
  });
});

describe('toResponseBody', () => {
  it('produces the standardized shape', () => {
    expect(toResponseBody(new ApiKeyInvalidError())).toEqual({
      success: false,
      code: 'API_KEY_INVALID',
      message: 'Invalid or missing API key.',
    });
  });
});
