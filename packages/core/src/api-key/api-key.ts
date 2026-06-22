import { getHeader, type RequestContext } from '../interfaces/request-context';
import { safeEqual } from '../utils/hash';

export interface ApiKeyOptions {
  /** Valid keys, or a (sync/async) resolver returning them. */
  keys: readonly string[] | (() => readonly string[] | Promise<readonly string[]>);
  /** Custom header to read the raw key from (default `x-api-key`). */
  header?: string;
  /**
   * Authorization scheme to also accept, e.g. `Authorization: ApiKey xxx`
   * (default `ApiKey`). Set to `null` to disable the Authorization fallback.
   */
  scheme?: string | null;
}

export interface ApiKeyResult {
  valid: boolean;
  /** The presented key, when one was found (regardless of validity). */
  key?: string;
}

/**
 * Validates API keys presented via `x-api-key` or `Authorization: <scheme> key`.
 * Supports multiple keys and constant-time comparison to avoid timing leaks.
 */
export class ApiKeyValidator {
  constructor(private readonly options: ApiKeyOptions) {}

  /** Extract the raw presented key from the request, or `undefined`. */
  extract(ctx: RequestContext): string | undefined {
    const headerName = this.options.header ?? 'x-api-key';
    const direct = getHeader(ctx, headerName);
    if (direct) return direct.trim();

    const scheme = this.options.scheme === undefined ? 'ApiKey' : this.options.scheme;
    if (scheme) {
      const auth = getHeader(ctx, 'authorization');
      if (auth) {
        const [s, ...rest] = auth.split(' ');
        if (s && s.toLowerCase() === scheme.toLowerCase() && rest.length) {
          return rest.join(' ').trim();
        }
      }
    }
    return undefined;
  }

  /** Validate the request's API key against the configured set. */
  async validate(ctx: RequestContext): Promise<ApiKeyResult> {
    const presented = this.extract(ctx);
    if (!presented) return { valid: false };

    const keys =
      typeof this.options.keys === 'function' ? await this.options.keys() : this.options.keys;

    // Compare against every key (constant work) to avoid short-circuit timing.
    let valid = false;
    for (const candidate of keys) {
      if (safeEqual(presented, candidate)) valid = true;
    }
    return { valid, key: presented };
  }
}
