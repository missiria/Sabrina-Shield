import express from 'express';
import {
  rateLimit,
  apiKey,
  securityHeaders,
  blocklist,
  botDetection,
  requestSize,
  shieldErrorHandler,
} from '@sabrina-shield/express';

const app = express();
app.use(express.json());

// Global protections, in order.
app.use(securityHeaders());
app.use(blocklist({ permanent: ['203.0.113.0/24'] }));
app.use(botDetection());
app.use(requestSize({ maxBodyBytes: 1_000_000 }));
app.use(rateLimit({ max: 100, window: '1m' }));

app.get('/', (_req, res) => {
  res.json({ message: 'Hello from Sabrina Shield (Express)' });
});

// Stricter limit + API key on an internal route.
app.post('/internal', apiKey({ keys: [process.env.API_KEY ?? 'dev-key'] }), (_req, res) => {
  res.json({ ok: true });
});

// Error handler renders ShieldError as standardized JSON — register last.
app.use(shieldErrorHandler());

app.listen(3000, () => {
  // eslint-disable-next-line no-console
  console.log('Sabrina Shield Express example on http://localhost:3000');
});
