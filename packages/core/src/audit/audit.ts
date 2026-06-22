import type { Clock } from '../interfaces/clock';
import { SystemClock } from '../interfaces/clock';
import type { AuditEvent, AuditEventType, AuditSink } from '../interfaces/audit';

/** Console sink that prints structured JSON; the default when none is given. */
export class ConsoleAuditSink implements AuditSink {
  // eslint-disable-next-line no-console
  emit(event: AuditEvent): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ source: 'sabrina-shield', ...event }));
  }
}

/** Sink that fans an event out to several sinks. */
export class CompositeAuditSink implements AuditSink {
  constructor(private readonly sinks: AuditSink[]) {}
  async emit(event: AuditEvent): Promise<void> {
    await Promise.all(this.sinks.map((s) => s.emit(event)));
  }
}

export interface AuditServiceDeps {
  sink?: AuditSink;
  clock?: Clock;
}

/**
 * Emits typed audit events to a pluggable {@link AuditSink}. Stamps each event
 * with the current time and never throws into the request path — sink failures
 * are swallowed (and could be routed to a logger by a wrapping sink).
 */
export class AuditService {
  private readonly sink: AuditSink;
  private readonly clock: Clock;

  constructor(deps: AuditServiceDeps = {}) {
    this.sink = deps.sink ?? new ConsoleAuditSink();
    this.clock = deps.clock ?? new SystemClock();
  }

  async emit(
    type: AuditEventType,
    details: Omit<AuditEvent, 'type' | 'timestamp'> = {},
  ): Promise<void> {
    try {
      await this.sink.emit({ type, timestamp: this.clock.now(), ...details });
    } catch {
      // Auditing must never break the request flow.
    }
  }
}
