# Quick Start

```ts
import { Module } from '@nestjs/common';
import { SabrinaShieldModule } from '@sabrina-shield/nest';

@Module({
  imports: [
    SabrinaShieldModule.forRoot({
      rateLimit: { default: { max: 100, window: '1m' } },
      headers: true,
      audit: true,
    }),
  ],
})
export class AppModule {}
```

Protect a route:

```ts
import { Controller, Get } from '@nestjs/common';
import { RateLimit } from '@sabrina-shield/nest';

@Controller()
export class AppController {
  @Get()
  @RateLimit({ max: 20, window: '1m' })
  findAll() {
    return [];
  }
}
```

When a limit is exceeded the response is a standardized `429`:

```json
{ "success": false, "code": "RATE_LIMITED", "message": "Too many requests." }
```

along with `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`,
and `Retry-After` headers.

See the runnable [`examples/nest-basic`](../examples/nest-basic) and
[`examples/express-basic`](../examples/express-basic).
