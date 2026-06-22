import { describe, it, expect, vi } from 'vitest';
import { AuditService, CompositeAuditSink } from './audit';
import type { AuditEvent, AuditSink } from '../interfaces/audit';

class CollectingSink implements AuditSink {
  events: AuditEvent[] = [];
  emit(e: AuditEvent) {
    this.events.push(e);
  }
}

describe('AuditService', () => {
  it('stamps timestamp from the clock and forwards to the sink', async () => {
    const sink = new CollectingSink();
    const service = new AuditService({ sink, clock: { now: () => 12345 } });
    await service.emit('RATE_LIMIT_BLOCKED', { ip: '1.2.3.4' });
    expect(sink.events[0]).toMatchObject({
      type: 'RATE_LIMIT_BLOCKED',
      timestamp: 12345,
      ip: '1.2.3.4',
    });
  });

  it('never throws when the sink fails', async () => {
    const service = new AuditService({
      sink: {
        emit: () => {
          throw new Error('sink down');
        },
      },
    });
    await expect(service.emit('LOGIN_FAILED')).resolves.toBeUndefined();
  });
});

describe('CompositeAuditSink', () => {
  it('fans out to all sinks', async () => {
    const a = new CollectingSink();
    const b = new CollectingSink();
    const composite = new CompositeAuditSink([a, b]);
    await composite.emit({ type: 'BOT_DETECTED', timestamp: 1 });
    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(1);
  });
});

it('ConsoleAuditSink writes JSON to stdout', async () => {
  const { ConsoleAuditSink } = await import('./audit');
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  new ConsoleAuditSink().emit({ type: 'IP_BLOCKED', timestamp: 1 });
  expect(spy).toHaveBeenCalledOnce();
  spy.mockRestore();
});
