import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { lastValueFrom, of } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AuditService, type AuditEvent, type AuditSink } from '@eksneks/core';
import { SecurityHeadersInterceptor, AuditInterceptor } from './interceptors';
import { Audit, SkipAudit } from './decorators';
import { makeExecCtx, makeReq, makeRes } from './test-helpers';
import type { CallHandler } from '@nestjs/common';

const next: CallHandler = { handle: () => of('ok') };

describe('SecurityHeadersInterceptor', () => {
  it('applies configured headers to the response', async () => {
    const interceptor = new SecurityHeadersInterceptor({ headers: true });
    const res = makeRes();
    await lastValueFrom(interceptor.intercept(makeExecCtx(makeReq(), res), next));
    expect(res.headers['X-Frame-Options']).toBe('DENY');
  });

  it('applies nothing when headers are disabled', async () => {
    const interceptor = new SecurityHeadersInterceptor({ headers: false });
    const res = makeRes();
    await lastValueFrom(interceptor.intercept(makeExecCtx(makeReq(), res), next));
    expect(Object.keys(res.headers)).toHaveLength(0);
  });
});

class CollectingSink implements AuditSink {
  events: AuditEvent[] = [];
  emit(e: AuditEvent) {
    this.events.push(e);
  }
}

class AuditRoutes {
  @Audit('CUSTOM_EVENT')
  tracked() {}
  @SkipAudit()
  skipped() {}
  untracked() {}
}

describe('AuditInterceptor', () => {
  it('emits the configured event type for @Audit routes', async () => {
    const sink = new CollectingSink();
    const interceptor = new AuditInterceptor(new Reflector(), new AuditService({ sink }));
    const ctx = makeExecCtx(makeReq(), makeRes(), AuditRoutes.prototype.tracked, AuditRoutes);
    await lastValueFrom(interceptor.intercept(ctx, next));
    expect(sink.events[0]?.type).toBe('CUSTOM_EVENT');
  });

  it('does not emit for @SkipAudit or untracked routes', async () => {
    const sink = new CollectingSink();
    const interceptor = new AuditInterceptor(new Reflector(), new AuditService({ sink }));
    await lastValueFrom(
      interceptor.intercept(
        makeExecCtx(makeReq(), makeRes(), AuditRoutes.prototype.skipped, AuditRoutes),
        next,
      ),
    );
    await lastValueFrom(
      interceptor.intercept(
        makeExecCtx(makeReq(), makeRes(), AuditRoutes.prototype.untracked, AuditRoutes),
        next,
      ),
    );
    expect(sink.events).toHaveLength(0);
  });
});
