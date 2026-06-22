import type { RequestContext } from '../interfaces/request-context';
import type { ShieldError } from '../errors/shield-error';

/**
 * A single ordered security check. Returns a {@link ShieldError} to block the
 * request, or `null` to allow it to proceed to the next check.
 */
export interface SecurityCheck {
  readonly name: string;
  run(ctx: RequestContext): Promise<ShieldError | null> | ShieldError | null;
}

export interface PipelineTrailEntry {
  name: string;
  blocked: boolean;
}

export interface PipelineDecision {
  allowed: boolean;
  /** The error from the first check that blocked, if any. */
  error?: ShieldError;
  /** Per-check outcome up to (and including) the blocking check. */
  trail: PipelineTrailEntry[];
}

/**
 * Runs an ordered list of {@link SecurityCheck}s, short-circuiting on the first
 * block. Returns a unified decision plus an audit trail; the caller decides
 * whether to throw `decision.error`.
 */
export class SecurityPipeline {
  constructor(private readonly checks: SecurityCheck[]) {}

  async evaluate(ctx: RequestContext): Promise<PipelineDecision> {
    const trail: PipelineTrailEntry[] = [];
    for (const check of this.checks) {
      const error = await check.run(ctx);
      trail.push({ name: check.name, blocked: error != null });
      if (error) return { allowed: false, error, trail };
    }
    return { allowed: true, trail };
  }
}
