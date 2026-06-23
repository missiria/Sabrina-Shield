# Audit Logs

Enable with `audit: true` (console sink) or supply a custom sink. The guard
emits an event whenever a request is blocked; `@Audit()` emits on successful
handler completion.

## Events

`RATE_LIMIT_BLOCKED`, `API_KEY_INVALID`, `IP_BLOCKED`, `COUNTRY_BLOCKED`,
`RISK_BLOCKED`, `BOT_DETECTED`, `PAYLOAD_TOO_LARGE`, `ABUSE_DETECTED`,
`LOGIN_SUCCESS`, `LOGIN_FAILED`, plus any custom string.

## Custom sink

```ts
import type { AuditSink, AuditEvent } from '@eksneks/core';

class DbAuditSink implements AuditSink {
  async emit(event: AuditEvent) {
    await db.auditLog.insert(event);
  }
}

SabrinaShieldModule.forRoot({ audit: { sink: new DbAuditSink() } });
```

Sink failures never break the request path. Use `CompositeAuditSink` to fan an
event out to several destinations (console + SIEM, etc.).

## Route-level

```ts
@Post('login')
@Audit('LOGIN_SUCCESS')
login() {}

@Get('health')
@SkipAudit()
health() {}
```
