import { getHeader, type RequestContext } from '../../interfaces/request-context';

export interface RequestSizeOptions {
  /** Max bytes for any request body (default 1 MiB). */
  maxBodyBytes?: number;
  /** Max bytes for JSON bodies specifically (falls back to maxBodyBytes). */
  maxJsonBytes?: number;
  /** Max bytes for multipart/form-data bodies (falls back to maxBodyBytes). */
  maxMultipartBytes?: number;
}

export interface RequestSizeResult {
  ok: boolean;
  /** The limit that applied (bytes). */
  limit: number;
  /** Declared size that exceeded the limit, if known. */
  size?: number;
}

const MIB = 1024 * 1024;

/**
 * Enforces request payload size limits using the declared `content-length`.
 * Picks a content-type-specific limit (JSON / multipart) when configured.
 * Streaming enforcement (for chunked bodies without content-length) is left to
 * the framework adapter, which can call {@link limitFor} per chunk.
 */
export class RequestSizeGuard {
  private readonly maxBody: number;
  private readonly maxJson: number;
  private readonly maxMultipart: number;

  constructor(options: RequestSizeOptions = {}) {
    this.maxBody = options.maxBodyBytes ?? MIB;
    this.maxJson = options.maxJsonBytes ?? this.maxBody;
    this.maxMultipart = options.maxMultipartBytes ?? this.maxBody;
  }

  /** The byte limit that applies to a request, based on its content type. */
  limitFor(ctx: RequestContext): number {
    const type = getHeader(ctx, 'content-type') ?? '';
    if (type.includes('application/json')) return this.maxJson;
    if (type.includes('multipart/form-data')) return this.maxMultipart;
    return this.maxBody;
  }

  /** Check a request's declared content-length against the applicable limit. */
  check(ctx: RequestContext): RequestSizeResult {
    const limit = this.limitFor(ctx);
    const declared = ctx.contentLength ?? this.parseContentLength(ctx);
    if (declared !== undefined && declared > limit) {
      return { ok: false, limit, size: declared };
    }
    return { ok: true, limit, size: declared };
  }

  private parseContentLength(ctx: RequestContext): number | undefined {
    const raw = getHeader(ctx, 'content-length');
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
}
