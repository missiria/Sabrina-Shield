# Redis & Custom Stores

## Redis (distributed)

```ts
import Redis from 'ioredis';
import { RedisStore } from '@eksneks/redis';
import { SabrinaShieldModule } from '@eksneks/nest';

const store = new RedisStore(new Redis(process.env.REDIS_URL!));

SabrinaShieldModule.forRoot({
  rateLimit: { default: { max: 100, window: '1m' }, store },
});
```

All multi-step operations (windowed counters, token-bucket drips, counter
increments) run as atomic Lua scripts, so limits are correct across instances —
ideal for Kubernetes, Docker Swarm, or any horizontally-scaled API.

## Writing a custom store

Implement the `RateLimitStore` port from `@eksneks/core`:

```ts
import type { RateLimitStore, CounterState, BucketParams, BucketState } from '@eksneks/core';

export class MyStore implements RateLimitStore {
  hit(key: string, windowMs: number, cost: number, nowMs: number): Promise<CounterState> {
    /* ... */
  }
  read(key: string, nowMs: number): Promise<number> {
    /* ... */
  }
  drip(key: string, params: BucketParams): Promise<BucketState> {
    /* ... */
  }
  reset(key: string): Promise<void> {
    /* ... */
  }
}
```

- `hit` / `read` back the fixed and sliding window algorithms.
- `drip` backs the token and leaky bucket algorithms; reuse the pure
  `computeDrip` helper from core to stay behaviourally identical.
- Implement `KeyValueStore` too if you want a distributed IP blocklist and
  abuse counters (`get` / `set` / `delete` / `increment`).

Atomicity must live in the store: do the read-modify-write in one operation
(a transaction, a Lua script, or — for in-memory — the single-threaded event loop).
