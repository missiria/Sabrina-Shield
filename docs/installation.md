# Installation

Requires Node.js 18+.

## NestJS

```bash
pnpm add @sabrina-shield/nest @sabrina-shield/core
# distributed rate limiting
pnpm add @sabrina-shield/redis ioredis
```

## Express

```bash
pnpm add @sabrina-shield/express @sabrina-shield/core
```

## Fastify

```bash
pnpm add @sabrina-shield/fastify @sabrina-shield/core
```

`@sabrina-shield/core` is a peer of every adapter — install it alongside.
Peers like `@nestjs/common`, `express`, `fastify`, and `ioredis` are not
bundled; provide the one your app uses.
