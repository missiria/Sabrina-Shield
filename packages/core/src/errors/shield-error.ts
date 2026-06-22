/** Stable, machine-readable error codes returned to clients. */
export type ShieldErrorCode =
  | 'RATE_LIMITED'
  | 'API_KEY_INVALID'
  | 'IP_BLOCKED'
  | 'COUNTRY_BLOCKED'
  | 'RISK_BLOCKED'
  | 'BOT_DETECTED'
  | 'PAYLOAD_TOO_LARGE'
  | 'ABUSE_DETECTED'
  | 'FORBIDDEN';

/**
 * Base class for every security decision that rejects a request.
 *
 * Carries a stable `code`, an HTTP `status` hint, and optional `metadata`
 * (e.g. `retryAfterMs`). Framework adapters translate it into the standardized
 * JSON response; the toolkit never throws raw `Error`s for security decisions.
 */
export abstract class ShieldError extends Error {
  abstract readonly code: ShieldErrorCode;
  abstract readonly status: number;
  readonly metadata: Record<string, unknown>;

  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.metadata = metadata;
    // Restore prototype chain for instanceof across transpiled targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
