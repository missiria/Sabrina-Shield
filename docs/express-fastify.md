# Express & Fastify

Both adapters reuse the same core engines; only request mapping differs.

## Express

```ts
import express from 'express';
import {
  securityHeaders,
  blocklist,
  botDetection,
  requestSize,
  rateLimit,
  apiKey,
  shieldErrorHandler,
} from '@sabrina-shield/express';

const app = express();
app.use(securityHeaders());
app.use(rateLimit({ max: 100, window: '1m' }));
app.post('/internal', apiKey({ keys: [process.env.API_KEY!] }), handler);
app.use(shieldErrorHandler()); // register LAST
```

Each middleware rejects via `next(error)`; `shieldErrorHandler()` renders the
standardized JSON body. Pass a `store` to `rateLimit` for distributed limiting.

## Fastify

```ts
import Fastify from 'fastify';
import { sabrinaShield } from '@sabrina-shield/fastify';

const app = Fastify();
await app.register(sabrinaShield, {
  rateLimit: { max: 100, window: '1m' },
  apiKeys: { keys: [process.env.API_KEY!] },
  headers: true,
  bot: true,
  requestSize: { maxBodyBytes: 1_000_000 },
  blocklist: { permanent: ['203.0.113.0/24'] },
});
```

The plugin registers `onRequest` hooks and a `setErrorHandler` that renders
`ShieldError`s; non-shield errors pass through to Fastify's default handler.
