# Sabrina Shield — Documentation

Framework-first security toolkit for NestJS APIs and web apps.

## Guides

- [Installation](./installation.md)
- [Quick Start](./quick-start.md)
- [NestJS Integration](./nestjs.md)
- [Rate Limiting](./rate-limiting.md)
- [API Keys](./api-keys.md)
- [Security Headers](./security-headers.md)
- [Audit Logs](./audit.md)
- [Redis & Custom Stores](./custom-stores.md)
- [Express & Fastify](./express-fastify.md)

API reference (Typedoc) is generated into `docs/api` via `pnpm docs`.

## Packages

| Package            | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `@eksneks/core`    | Framework-agnostic engines, interfaces, errors         |
| `@eksneks/nest`    | NestJS module, guard, decorators, interceptors, filter |
| `@eksneks/redis`   | Distributed Redis store                                |
| `@eksneks/express` | Express middleware                                     |
| `@eksneks/fastify` | Fastify plugin                                         |

## Architecture

Ports & adapters: `core` defines pure logic and ports (`RateLimitStore`,
`AuditSink`, `GeoProvider`); framework packages map their native request to a
neutral `RequestContext` and delegate to the engines. Core never imports a
framework.
