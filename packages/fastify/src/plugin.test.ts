import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { MemoryStore } from '@sabrina-shield/core';
import { sabrinaShield, type FastifyShieldOptions } from './plugin';

async function build(options: FastifyShieldOptions): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(sabrinaShield, options);
  app.get('/x', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('sabrinaShield plugin', () => {
  it('applies security headers and allows normal requests', async () => {
    const app = await build({ headers: true });
    const res = await app.inject({ method: 'GET', url: '/x' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-frame-options']).toBe('DENY');
    await app.close();
  });

  it('rate limits and renders the standardized 429 body', async () => {
    const app = await build({
      rateLimit: { max: 1, window: '1m', store: new MemoryStore(), clock: { now: () => 0 } },
    });
    const first = await app.inject({ method: 'GET', url: '/x' });
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-ratelimit-limit']).toBe('1');
    const second = await app.inject({ method: 'GET', url: '/x' });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(second.headers['retry-after']).toBeDefined();
    await app.close();
  });

  it('rejects invalid API keys with 401', async () => {
    const app = await build({ apiKeys: { keys: ['good'] } });
    expect((await app.inject({ method: 'GET', url: '/x' })).statusCode).toBe(401);
    const ok = await app.inject({ method: 'GET', url: '/x', headers: { 'x-api-key': 'good' } });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it('blocks bots and blocklisted IPs', async () => {
    const botApp = await build({ bot: true });
    const botRes = await botApp.inject({
      method: 'GET',
      url: '/x',
      headers: { 'user-agent': 'sqlmap/1' },
    });
    expect(botRes.statusCode).toBe(403);
    expect(botRes.json()).toMatchObject({ code: 'BOT_DETECTED' });
    await botApp.close();

    const blockApp = await build({ blocklist: { permanent: ['127.0.0.1', '::1'] } });
    const blockRes = await blockApp.inject({ method: 'GET', url: '/x' });
    expect(blockRes.statusCode).toBe(403);
    await blockApp.close();
  });

  it('rejects oversized payloads', async () => {
    const app = await build({ requestSize: { maxBodyBytes: 1 } });
    const res = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { 'content-length': '500' },
      payload: 'x'.repeat(500),
    });
    expect(res.statusCode).toBe(413);
    await app.close();
  });

  it('passes through with no protections configured', async () => {
    const app = await build({ headers: false });
    expect((await app.inject({ method: 'GET', url: '/x' })).statusCode).toBe(200);
    await app.close();
  });

  it('forwards non-shield errors to the default handler', async () => {
    const app = Fastify();
    await app.register(sabrinaShield, {});
    app.get('/boom', async () => {
      throw new Error('kaboom');
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
