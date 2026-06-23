import type {
  RateLimitOptions,
  RateLimitStore,
  ApiKeyOptions,
  SecurityHeadersOptions,
  AuditSink,
  RiskRule,
  IpBlocklistOptions,
  RequestSizeOptions,
  BotDetectorOptions,
  GeoProvider,
} from '@eksneks/core';

export interface RateLimitModuleOptions {
  /** Default limit applied to every route lacking an explicit `@RateLimit`. */
  default?: RateLimitOptions;
  /** Backing store (default in-memory). Use `RedisStore` for distributed setups. */
  store?: RateLimitStore;
}

export interface AuditModuleOptions {
  sink?: AuditSink;
}

export interface RiskModuleOptions {
  rules: RiskRule[];
  threshold?: number;
}

/** Root configuration for {@link SabrinaShieldModule}. */
export interface SabrinaShieldOptions {
  /** Enable rate limiting (with a default policy + store). */
  rateLimit?: RateLimitModuleOptions;
  /** Require API keys globally, or pass validator options. `true` is invalid — supply keys. */
  apiKeys?: ApiKeyOptions;
  /** Apply security headers. `true` uses secure defaults. */
  headers?: SecurityHeadersOptions | boolean;
  /** Enable audit logging. `true` uses the console sink. */
  audit?: AuditModuleOptions | boolean;
  /** Enable the risk engine globally. */
  risk?: RiskModuleOptions;
  /** Enable bot detection globally. `true` uses default signatures. */
  bot?: BotDetectorOptions | boolean;
  /** Configure the IP blocklist. */
  blocklist?: IpBlocklistOptions;
  /** Enable request size protection. `true` uses defaults. */
  requestSize?: RequestSizeOptions | boolean;
  /** Geo provider used by country rules and risk scoring. */
  geoProvider?: GeoProvider;
  /** Register the global guards (default true). */
  useGlobalGuards?: boolean;
}

/** Async configuration for `forRootAsync`. */
export interface SabrinaShieldAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<SabrinaShieldOptions> | SabrinaShieldOptions;
}
