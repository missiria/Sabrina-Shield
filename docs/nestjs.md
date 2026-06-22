# NestJS Integration

`SabrinaShieldModule` is `@Global`. Register it once with `forRoot` (or
`forRootAsync`). It wires a single global `ShieldGuard`, the security-header and
audit interceptors, and the `ShieldExceptionFilter`.

```ts
SabrinaShieldModule.forRoot({
  rateLimit: { default: { max: 100, window: '1m' }, store },
  apiKeys: { keys: [process.env.API_KEY!] },
  headers: true,
  audit: true,
  bot: true,
  requestSize: { maxBodyBytes: 1_000_000 },
  blocklist: { permanent: ['203.0.113.0/24'] },
  risk: {
    threshold: 100,
    rules: [
      /* RiskRule[] */
    ],
  },
  geoProvider, // optional, powers country rules + risk
});
```

Async config:

```ts
SabrinaShieldModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    rateLimit: { default: { max: config.get('RL_MAX'), window: '1m' } },
  }),
});
```

## Decorators

| Decorator                                     | Effect                                             |
| --------------------------------------------- | -------------------------------------------------- |
| `@RateLimit(opts)`                            | Apply a rate limit                                 |
| `@NoRateLimit()`                              | Skip rate limiting                                 |
| `@Public()`                                   | Skip rate limiting + auth-style guards             |
| `@ApiKey()`                                   | Require a valid API key                            |
| `@Risk({ threshold })`                        | Enable risk scoring (optional per-route threshold) |
| `@Audit(type?)`                               | Emit an audit event                                |
| `@SkipAudit()`                                | Skip audit logging                                 |
| `@AllowCountry(...c)` / `@BlockCountry(...c)` | Geo allow/block (needs GeoProvider)                |
| `@BlockIp(...ips)`                            | Block IPs/CIDRs for the route                      |
| `@RequireRole(...r)`                          | Require a role on `req.user.roles`                 |

## Decision order

The guard evaluates: blocklist → bot → country → risk → request size →
API key → role → rate limit, short-circuiting on the first violation and emitting
an audit event. Works on both Express and Fastify platforms.
