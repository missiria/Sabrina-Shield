import { ShieldError, type ShieldErrorCode } from './shield-error';

export class RateLimitedError extends ShieldError {
  readonly code: ShieldErrorCode = 'RATE_LIMITED';
  readonly status = 429;
  constructor(retryAfterMs: number, metadata: Record<string, unknown> = {}) {
    super('Too many requests.', { retryAfterMs, ...metadata });
  }
}

export class ApiKeyInvalidError extends ShieldError {
  readonly code: ShieldErrorCode = 'API_KEY_INVALID';
  readonly status = 401;
  constructor(message = 'Invalid or missing API key.', metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}

export class IpBlockedError extends ShieldError {
  readonly code: ShieldErrorCode = 'IP_BLOCKED';
  readonly status = 403;
  constructor(message = 'Your IP address is blocked.', metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}

export class CountryBlockedError extends ShieldError {
  readonly code: ShieldErrorCode = 'COUNTRY_BLOCKED';
  readonly status = 403;
  constructor(
    message = 'Access from your country is not allowed.',
    metadata: Record<string, unknown> = {},
  ) {
    super(message, metadata);
  }
}

export class RiskThresholdError extends ShieldError {
  readonly code: ShieldErrorCode = 'RISK_BLOCKED';
  readonly status = 403;
  constructor(score: number, threshold: number, metadata: Record<string, unknown> = {}) {
    super('Request blocked by risk policy.', { score, threshold, ...metadata });
  }
}

export class BotDetectedError extends ShieldError {
  readonly code: ShieldErrorCode = 'BOT_DETECTED';
  readonly status = 403;
  constructor(
    message = 'Automated traffic is not allowed.',
    metadata: Record<string, unknown> = {},
  ) {
    super(message, metadata);
  }
}

export class PayloadTooLargeError extends ShieldError {
  readonly code: ShieldErrorCode = 'PAYLOAD_TOO_LARGE';
  readonly status = 413;
  constructor(limitBytes: number, metadata: Record<string, unknown> = {}) {
    super('Request payload too large.', { limitBytes, ...metadata });
  }
}

export class AbuseDetectedError extends ShieldError {
  readonly code: ShieldErrorCode = 'ABUSE_DETECTED';
  readonly status = 429;
  constructor(message = 'Abusive behavior detected.', metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}

export class RoleForbiddenError extends ShieldError {
  readonly code: ShieldErrorCode = 'FORBIDDEN';
  readonly status = 403;
  constructor(message = 'Insufficient permissions.', metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}
