# MEMORY — Sabrina Shield

Framework-first security toolkit for NestJS APIs (framework-agnostic core + adapters). MIT. pnpm monorepo.

## Layout & toolchain

- **pnpm workspace** (`packages/*`, `examples/*`) + **turborepo** (`turbo.json`: build/test/lint/typecheck, build dependsOn `^build`).
- **tsup** per package — dual ESM+CJS + `.d.ts`, `treeshake`, `sideEffects:false`. Shared preset: `tsup.config.base.ts`.
- **Vitest** per package (coverage gates in each `vitest.config.ts`). **ESLint + Prettier + Husky + commitlint (Conventional Commits) + Changesets**.
- Node ≥ 18. TS strict + `noUncheckedIndexedAccess`. pnpm via corepack (`corepack prepare pnpm@9.15.0 --activate`).
- Commands (root): `pnpm build | test | test:coverage | lint | typecheck | docs`. Released **v0.1.0** (tag + GitHub release on branch `feat/mvp-scaffold`, NOT yet merged to main; not yet on npm).

## Packages

| Package            | Purpose                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `@eksneks/core`    | Engines, ports, errors, `SecurityPipeline`. No framework imports.                           |
| `@eksneks/nest`    | `SabrinaShieldModule`, composite `ShieldGuard`, decorators, interceptors, exception filter. |
| `@eksneks/redis`   | Distributed `RedisStore` (atomic Lua via injected `ioredis`).                               |
| `@eksneks/express` | Middleware factories + `shieldErrorHandler`.                                                |
| `@eksneks/fastify` | Plugin (`onRequest` hooks) + error handler.                                                 |

## Architecture (key seams — non-obvious)

- **Ports & adapters.** Core defines ports (`RateLimitStore`, `KeyValueStore`, `AuditSink`, `GeoProvider`, `Clock`, `Logger`); adapters provide them.
- **`RequestContext`** = the single seam. Every framework maps its native request to it; every engine consumes ONLY it. Each adapter has a `toRequestContext`.
- **`RateLimitStore`** primitives: `hit` (windowed counter — fixed/sliding), `read`, `drip` (token/leaky bucket), `reset`. Atomicity lives in the store: MemoryStore = single-threaded event loop; RedisStore = Lua. Pure `computeDrip` (core/cache) is shared math so memory + Lua stay identical.
- **`ShieldError` hierarchy + `toResponseBody`** = single source for the standardized `{success:false,code,message}` JSON. Reused by every adapter's error handler.
- Rate-limit **algorithms** are a strategy (`fixed-window | sliding-window | token-bucket | leaky-bucket`); fixed window is FIRST-HIT-relative, not epoch-aligned. **Risk rules** are composable.

## Features (MVP)

Rate limiting (4 algos; `keyBy` ip/user/apiKey/route/header/fingerprint, combinable) · API keys (constant-time, `x-api-key` or `Authorization: ApiKey`) · security headers · audit logging (pluggable sink) · risk engine (scored rules + threshold) · device fingerprint · bot detection (UA signatures) · IP blocklist (CIDR v4/v6, temp/permanent) · request-size · abuse detection (sliding counters) · `SecurityPipeline`.

## NestJS specifics (gotchas)

- `SabrinaShieldModule` is `@Global`. One composite `ShieldGuard` runs all checks in order: **blocklist → bot → country → risk → request-size → apiKey → role → rate-limit**, short-circuit on first block.
- Exclusions are **rate-limit-only**: `@Public`/`@NoRateLimit` still pass through blocklist + bot (they run first).
- `keyBy:'route'` resolves to NestJS stable handler id (`Controller.handler`) — immune to path/slash/case/encoding tricks. Raw `<method> <path>` fallback is NOT.
- `keyBy:'fingerprint'` is **device-stable (excludes IP)** so it caps a client across IP rotation. Combine with `ip` for both axes.

## Tests

- ~180+ unit tests + extensive adversarial **`*.scenarios.test.ts`** suites (IP-bypass, window-reset, boundary, burst, parallel/race, per-route, global-fallback, disabled-route, user-based/multi-dimensional). Coverage: core/nest/redis strict; express/fastify branch threshold relaxed to 70 (thin glue).
- **ioredis-mock caveat:** shares one process-global dataset AND its Lua EVAL is unreliable under turbo's concurrent load → redis tests use a unique `keyPrefix` per test and assert relative (not absolute) bucket state.

## Consuming it elsewhere (e.g. shark-app)

- npm scope is **`@eksneks`** (org `eksneks`). Publish via CI: `.github/workflows/release.yml` (Changesets) using repo secret `NPM_TOKEN`. Then `npm i @eksneks/nest @eksneks/core`.
- npm **cannot** git-install a single monorepo subpackage (workspace:_ deps + no committed dist). `pnpm pack` (the real npm `.tgz`) is the only registry-free option; tarball rewrites `workspace:_`→`0.1.0`.
