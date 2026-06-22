import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RateLimit, ApiKey, Public, RequireRole, BlockIp, NoRateLimit } from './decorators';
import { METADATA } from './constants';

class Demo {
  @RateLimit({ max: 5, window: '1m' })
  @ApiKey()
  @RequireRole('admin', 'owner')
  @BlockIp('10.0.0.0/8')
  limited() {}

  @Public()
  @NoRateLimit()
  open() {}
}

describe('decorators set metadata read by Reflector', () => {
  const reflector = new Reflector();

  it('attaches rate-limit, api-key, role and ip metadata', () => {
    const fn = Demo.prototype.limited;
    expect(reflector.get(METADATA.rateLimit, fn)).toEqual({ max: 5, window: '1m' });
    expect(reflector.get(METADATA.apiKey, fn)).toBe(true);
    expect(reflector.get(METADATA.requireRole, fn)).toEqual(['admin', 'owner']);
    expect(reflector.get(METADATA.blockIp, fn)).toEqual(['10.0.0.0/8']);
  });

  it('attaches public + no-rate-limit', () => {
    const fn = Demo.prototype.open;
    expect(reflector.get(METADATA.public, fn)).toBe(true);
    expect(reflector.get(METADATA.noRateLimit, fn)).toBe(true);
  });
});
