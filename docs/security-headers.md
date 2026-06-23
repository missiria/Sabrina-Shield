# Security Headers

`headers: true` applies secure defaults. Pass an object to override or disable
any header (`false` omits it).

| Header                      | Default                                    |
| --------------------------- | ------------------------------------------ |
| `Content-Security-Policy`   | `default-src 'self'`                       |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains`      |
| `X-Frame-Options`           | `DENY`                                     |
| `Referrer-Policy`           | `no-referrer`                              |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()` |
| `X-Content-Type-Options`    | `nosniff`                                  |
| `X-XSS-Protection`          | `0` (modern guidance)                      |

```ts
SabrinaShieldModule.forRoot({
  headers: {
    contentSecurityPolicy: "default-src 'self'; img-src *",
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    frameOptions: 'SAMEORIGIN',
  },
});
```

The pure builder is also exported for direct use:

```ts
import { buildSecurityHeaders } from '@eksneks/core';
const headers = buildSecurityHeaders({ hsts: false });
```
