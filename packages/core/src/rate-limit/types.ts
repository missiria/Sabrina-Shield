import type { RateLimitResult, RateLimitStore } from '../interfaces/store';
import type { Duration } from '../utils/duration';

export type RateLimitAlgorithmName =
  | 'fixed-window'
  | 'sliding-window'
  | 'token-bucket'
  | 'leaky-bucket';

/** What to key the limit by. Multiple values are combined. */
export type RateLimitKeyBy = 'ip' | 'user' | 'apiKey' | 'route' | 'header' | 'fingerprint';

export interface RateLimitOptions {
  /** Maximum hits allowed per window. */
  max: number;
  /** Window length, e.g. `'1m'`, `30_000`. */
  window: Duration;
  /** Algorithm to use (default `fixed-window`). */
  algorithm?: RateLimitAlgorithmName;
  /** Hits this request costs (default 1). */
  cost?: number;
  /** Dimension(s) to key the limit by (default `'ip'`). */
  keyBy?: RateLimitKeyBy | RateLimitKeyBy[];
  /** Header name when `keyBy` includes `'header'`. */
  header?: string;
  /** Static prefix to namespace keys (e.g. a route name). */
  prefix?: string;
}

/** Normalized parameters passed to an algorithm. */
export interface AlgorithmParams {
  limit: number;
  windowMs: number;
  cost: number;
  nowMs: number;
}

/**
 * Strategy interface for rate-limit algorithms. Implementations are stateless
 * and operate entirely through the injected {@link RateLimitStore}.
 */
export interface RateLimitAlgorithm {
  readonly name: RateLimitAlgorithmName;
  consume(store: RateLimitStore, key: string, params: AlgorithmParams): Promise<RateLimitResult>;
}
