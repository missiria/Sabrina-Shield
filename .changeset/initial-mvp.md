---
'@sabrina-shield/core': minor
'@sabrina-shield/nest': minor
'@sabrina-shield/redis': minor
'@sabrina-shield/express': minor
'@sabrina-shield/fastify': minor
---

Initial MVP release of Sabrina Shield.

- **core**: rate limiting (fixed/sliding window, token/leaky bucket), API keys,
  security headers, audit logging, risk engine, device fingerprinting, bot
  detection, IP blocklist (CIDR v4/v6), request-size protection, abuse
  detection, standardized error hierarchy, and the `SecurityPipeline`. Pluggable
  `RateLimitStore` / `KeyValueStore` ports with an in-memory implementation.
- **nest**: `SabrinaShieldModule.forRoot/forRootAsync`, a composite `ShieldGuard`,
  decorators (`@RateLimit`, `@ApiKey`, `@Public`, `@Risk`, `@Audit`, `@BlockIp`,
  `@BlockCountry`, `@RequireRole`, …), security-header + audit interceptors, and
  the `ShieldExceptionFilter`. Works on Express and Fastify platforms.
- **redis**: distributed `RedisStore` using atomic Lua scripts.
- **express**: middleware factories + standardized error handler.
- **fastify**: plugin with `onRequest` hooks + error handler.
