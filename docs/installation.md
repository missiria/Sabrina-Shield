# Installation

Requires Node.js 18+.

## NestJS

```bash
pnpm add @eksneks/nest @eksneks/core
# distributed rate limiting
pnpm add @eksneks/redis ioredis
```

## Express

```bash
pnpm add @eksneks/express @eksneks/core
```

## Fastify

```bash
pnpm add @eksneks/fastify @eksneks/core
```

`@eksneks/core` is a peer of every adapter — install it alongside.
Peers like `@nestjs/common`, `express`, `fastify`, and `ioredis` are not
bundled; provide the one your app uses.
