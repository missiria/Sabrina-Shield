import type { Clock } from '../interfaces/clock';
import { SystemClock } from '../interfaces/clock';
import type { RateLimitResult, RateLimitStore } from '../interfaces/store';
import type { RequestContext } from '../interfaces/request-context';
import { parseDuration } from '../utils/duration';
import { ALGORITHMS } from './algorithms';
import { resolveKey } from './key-resolver';
import type { RateLimitAlgorithm, RateLimitOptions } from './types';

export interface RateLimiterDeps {
  store: RateLimitStore;
  clock?: Clock;
  /** Extra algorithms keyed by name, merged over the built-ins. */
  algorithms?: Record<string, RateLimitAlgorithm>;
}

/**
 * Framework-agnostic rate limiter. Resolves a key from the request, selects the
 * configured algorithm, and consumes from the store. Returns a
 * {@link RateLimitResult} the caller turns into headers / a 429.
 */
export class RateLimiter {
  private readonly store: RateLimitStore;
  private readonly clock: Clock;
  private readonly algorithms: Record<string, RateLimitAlgorithm>;

  constructor(deps: RateLimiterDeps) {
    this.store = deps.store;
    this.clock = deps.clock ?? new SystemClock();
    this.algorithms = { ...ALGORITHMS, ...deps.algorithms };
  }

  /** Evaluate the limit for an explicit key. */
  async consume(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const algorithm = this.algorithms[options.algorithm ?? 'fixed-window'];
    if (!algorithm) {
      throw new Error(`Unknown rate-limit algorithm: ${options.algorithm}`);
    }
    return algorithm.consume(this.store, key, {
      limit: options.max,
      windowMs: parseDuration(options.window),
      cost: options.cost ?? 1,
      nowMs: this.clock.now(),
    });
  }

  /** Resolve the key from the request context, then evaluate. */
  async check(ctx: RequestContext, options: RateLimitOptions): Promise<RateLimitResult> {
    return this.consume(resolveKey(ctx, options), options);
  }
}
