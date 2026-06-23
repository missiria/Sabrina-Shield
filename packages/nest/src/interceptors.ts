import {
  Injectable,
  Inject,
  Optional,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  buildSecurityHeaders,
  type AuditService,
  type SecurityHeadersOptions,
} from '@eksneks/core';
import { METADATA, TOKENS } from './constants';
import { toRequestContext, setResponseHeader } from './context';

/** Applies the configured security headers to every response. */
@Injectable()
export class SecurityHeadersInterceptor implements NestInterceptor {
  private readonly headers: Record<string, string>;

  constructor(
    @Optional() @Inject(TOKENS.options) options?: { headers?: SecurityHeadersOptions | boolean },
  ) {
    const cfg = options?.headers;
    this.headers =
      cfg === false || cfg === undefined ? {} : buildSecurityHeaders(cfg === true ? {} : cfg);
  }

  intercept(execCtx: ExecutionContext, next: CallHandler): Observable<unknown> {
    for (const [name, value] of Object.entries(this.headers)) {
      setResponseHeader(execCtx, name, value);
    }
    return next.handle();
  }
}

/** Emits an audit event for routes annotated with `@Audit` (unless `@SkipAudit`). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(TOKENS.auditService) private readonly audit?: AuditService,
  ) {}

  intercept(execCtx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(METADATA.skipAudit, [
      execCtx.getHandler(),
      execCtx.getClass(),
    ]);
    const auditMeta = this.reflector.getAllAndOverride<string | boolean>(METADATA.audit, [
      execCtx.getHandler(),
      execCtx.getClass(),
    ]);

    if (!this.audit || skip || auditMeta === undefined) return next.handle();
    const ctx = toRequestContext(execCtx);
    const type = typeof auditMeta === 'string' ? auditMeta : 'REQUEST';

    return next.handle().pipe(
      tap(() => {
        void this.audit!.emit(type, {
          ip: ctx.ip,
          method: ctx.method,
          path: ctx.path,
          userId: ctx.userId,
        });
      }),
    );
  }
}
