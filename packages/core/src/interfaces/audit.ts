/** Canonical audit event types emitted by the toolkit. */
export type AuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'RATE_LIMIT_BLOCKED'
  | 'API_KEY_INVALID'
  | 'IP_BLOCKED'
  | 'COUNTRY_BLOCKED'
  | 'RISK_BLOCKED'
  | 'BOT_DETECTED'
  | 'PAYLOAD_TOO_LARGE'
  | 'ABUSE_DETECTED'
  | (string & {});

/** A single audit record. */
export interface AuditEvent {
  type: AuditEventType;
  /** Epoch milliseconds when the event occurred. */
  timestamp: number;
  ip?: string;
  userId?: string;
  method?: string;
  path?: string;
  /** Arbitrary structured detail (scores, matched signatures, ...). */
  metadata?: Record<string, unknown>;
}

/** Pluggable destination for audit events (console, DB, SIEM, ...). */
export interface AuditSink {
  emit(event: AuditEvent): Promise<void> | void;
}
