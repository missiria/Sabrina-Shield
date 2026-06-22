import { describe, it, expect } from 'vitest';
import { ApiKeyValidator } from './api-key';
import type { RequestContext } from '../interfaces/request-context';

const ctx = (headers: Record<string, string>): RequestContext => ({
  ip: '1.2.3.4',
  method: 'GET',
  path: '/x',
  headers,
});

describe('ApiKeyValidator', () => {
  const validator = new ApiKeyValidator({ keys: ['key-a', 'key-b'] });

  it('validates via x-api-key header', async () => {
    expect((await validator.validate(ctx({ 'x-api-key': 'key-a' }))).valid).toBe(true);
    expect((await validator.validate(ctx({ 'x-api-key': 'nope' }))).valid).toBe(false);
  });

  it('validates via Authorization: ApiKey scheme', async () => {
    expect((await validator.validate(ctx({ authorization: 'ApiKey key-b' }))).valid).toBe(true);
    expect((await validator.validate(ctx({ authorization: 'Bearer key-b' }))).valid).toBe(false);
  });

  it('returns invalid when no key is presented', async () => {
    const r = await validator.validate(ctx({}));
    expect(r.valid).toBe(false);
    expect(r.key).toBeUndefined();
  });

  it('supports an async key resolver', async () => {
    const v = new ApiKeyValidator({ keys: async () => ['dynamic'] });
    expect((await v.validate(ctx({ 'x-api-key': 'dynamic' }))).valid).toBe(true);
  });

  it('can disable the Authorization fallback', async () => {
    const v = new ApiKeyValidator({ keys: ['k'], scheme: null });
    expect((await v.validate(ctx({ authorization: 'ApiKey k' }))).valid).toBe(false);
  });
});
