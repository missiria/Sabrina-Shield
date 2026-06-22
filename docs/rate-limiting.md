# Rate Limiting

## Algorithms

Set `algorithm` on `@RateLimit` (default `fixed-window`):

| Algorithm        | Behaviour                                                     |
| ---------------- | ------------------------------------------------------------- |
| `fixed-window`   | One counter per window. Cheapest; allows boundary bursts.     |
| `sliding-window` | Weighted blend of current + previous window. Smooths bursts.  |
| `token-bucket`   | Continuous refill up to a capacity; allows controlled bursts. |
| `leaky-bucket`   | Steady drain; enforces a smooth long-run rate.                |

```ts
@RateLimit({ max: 50, window: '1m', algorithm: 'token-bucket' })
```

## Keying

Limit per dimension with `keyBy` (combine several):

```ts
@RateLimit({ max: 5, window: '1m', keyBy: ['ip', 'route'] })
@RateLimit({ max: 1000, window: '1h', keyBy: 'apiKey' })
@RateLimit({ max: 10, window: '1m', keyBy: 'header', header: 'x-tenant' })
@RateLimit({ max: 20, window: '1m', keyBy: 'fingerprint' })
```

Supported: `ip`, `user`, `apiKey`, `route`, `header`, `fingerprint`.

## Exemptions

```ts
@NoRateLimit()   // skip limiting for this route
@Public()        // skip limiting + auth-style guards
```

## Window format

`window` accepts milliseconds or a string: `'500ms'`, `'30s'`, `'1m'`, `'2h'`, `'1d'`.
