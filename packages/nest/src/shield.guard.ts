import {
  Injectable,
  Inject,
  Optional,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RateLimiter,
  ApiKeyValidator,
  AuditService,
  RiskEngine,
  BotDetector,
  IpBlocklist,
  RequestSizeGuard,
  RateLimitedError,
  ApiKeyInvalidError,
  IpBlockedError,
  CountryBlockedError,
  RiskThresholdError,
  BotDetectedError,
  PayloadTooLargeError,
  RoleForbiddenError,
  ipInAny,
  type RateLimitOptions,
  type RequestContext,
  type GeoProvider,
} from '@eksneks/core';
import { METADATA, TOKENS } from './constants';
import { toRequestContext, setResponseHeader } from './context';

/**
 * Single composite guard that enforces every Sabrina Shield protection in a
 * deterministic order, short-circuiting on the first violation. Reads
 * per-route decorator metadata and delegates to the engines built by the
 * module. Registered globally by default; can also be applied with
 * `@UseGuards(ShieldGuard)`.
 */
@Injectable()
export class ShieldGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(TOKENS.options)
    private readonly options?: { rateLimit?: { default?: RateLimitOptions } },
    @Optional() @Inject(TOKENS.rateLimiter) private readonly rateLimiter?: RateLimiter,
    @Optional() @Inject(TOKENS.apiKeyValidator) private readonly apiKeys?: ApiKeyValidator,
    @Optional() @Inject(TOKENS.auditService) private readonly audit?: AuditService,
    @Optional() @Inject(TOKENS.riskEngine) private readonly risk?: RiskEngine,
    @Optional() @Inject(TOKENS.botDetector) private readonly bot?: BotDetector,
    @Optional() @Inject(TOKENS.blocklist) private readonly blocklist?: IpBlocklist,
    @Optional() @Inject(TOKENS.requestSizeGuard) private readonly requestSize?: RequestSizeGuard,
    @Optional() @Inject(TOKENS.geoProvider) private readonly geo?: GeoProvider,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(execCtx: ExecutionContext): Promise<boolean> {
    const ctx = toRequestContext(execCtx);
    const isPublic = this.meta<boolean>(METADATA.public, execCtx) === true;

    await this.checkBlocklist(execCtx, ctx);
    await this.checkBot(ctx);
    await this.checkCountry(execCtx, ctx);
    await this.checkRisk(execCtx, ctx);
    this.checkRequestSize(ctx);
    await this.checkApiKey(execCtx, ctx, isPublic);
    this.checkRole(execCtx, ctx);
    await this.checkRateLimit(execCtx, ctx, isPublic);

    return true;
  }

  private async emit(type: string, ctx: RequestContext, metadata?: Record<string, unknown>) {
    await this.audit?.emit(type, { ip: ctx.ip, method: ctx.method, path: ctx.path, metadata });
  }

  private async checkBlocklist(execCtx: ExecutionContext, ctx: RequestContext) {
    const perRoute = this.meta<string[]>(METADATA.blockIp, execCtx);
    if (perRoute && ipInAny(ctx.ip, perRoute)) {
      await this.emit('IP_BLOCKED', ctx);
      throw new IpBlockedError();
    }
    if (this.blocklist && (await this.blocklist.isBlocked(ctx.ip))) {
      await this.emit('IP_BLOCKED', ctx);
      throw new IpBlockedError();
    }
  }

  private async checkBot(ctx: RequestContext) {
    if (!this.bot) return;
    const result = this.bot.detect(ctx);
    if (result.isBot) {
      await this.emit('BOT_DETECTED', ctx, { signature: result.signature?.name });
      throw new BotDetectedError();
    }
  }

  private async checkCountry(execCtx: ExecutionContext, ctx: RequestContext) {
    const allow = this.meta<string[]>(METADATA.allowCountry, execCtx);
    const block = this.meta<string[]>(METADATA.blockCountry, execCtx);
    if (!allow && !block) return;
    if (!this.geo) return; // no provider configured — cannot enforce
    const { country } = await this.geo.lookup(ctx.ip);
    if (!country) return;
    const upper = country.toUpperCase();
    const blocked =
      (allow && !allow.map((c) => c.toUpperCase()).includes(upper)) ||
      (block && block.map((c) => c.toUpperCase()).includes(upper));
    if (blocked) {
      await this.emit('COUNTRY_BLOCKED', ctx, { country: upper });
      throw new CountryBlockedError();
    }
  }

  private async checkRisk(execCtx: ExecutionContext, ctx: RequestContext) {
    const routeRisk = this.meta<{ threshold?: number } | boolean>(METADATA.risk, execCtx);
    if (!this.risk || routeRisk === undefined) return;
    const assessment = await this.risk.assess(ctx);
    const threshold =
      typeof routeRisk === 'object' && routeRisk.threshold !== undefined
        ? routeRisk.threshold
        : assessment.threshold;
    if (assessment.score >= threshold) {
      await this.emit('RISK_BLOCKED', ctx, { score: assessment.score, threshold });
      throw new RiskThresholdError(assessment.score, threshold, {
        breakdown: assessment.breakdown,
      });
    }
  }

  private checkRequestSize(ctx: RequestContext) {
    if (!this.requestSize) return;
    const result = this.requestSize.check(ctx);
    if (!result.ok) throw new PayloadTooLargeError(result.limit, { size: result.size });
  }

  private async checkApiKey(execCtx: ExecutionContext, ctx: RequestContext, isPublic: boolean) {
    if (!this.apiKeys || isPublic) return;
    const required = this.meta<boolean>(METADATA.apiKey, execCtx) === true;
    if (!required) return; // only enforce where @ApiKey is present
    const result = await this.apiKeys.validate(ctx);
    if (!result.valid) {
      await this.emit('API_KEY_INVALID', ctx);
      throw new ApiKeyInvalidError();
    }
  }

  private checkRole(execCtx: ExecutionContext, ctx: RequestContext) {
    const roles = this.meta<string[]>(METADATA.requireRole, execCtx);
    if (!roles || roles.length === 0) return;
    const user = (ctx.raw as { user?: { roles?: string[] } } | undefined)?.user;
    const held = new Set(user?.roles ?? []);
    if (!roles.some((r) => held.has(r))) throw new RoleForbiddenError();
  }

  private async checkRateLimit(execCtx: ExecutionContext, ctx: RequestContext, isPublic: boolean) {
    if (!this.rateLimiter) return;
    if (isPublic || this.meta<boolean>(METADATA.noRateLimit, execCtx) === true) return;
    const options =
      this.meta<RateLimitOptions>(METADATA.rateLimit, execCtx) ?? this.options?.rateLimit?.default;
    if (!options) return; // no per-route policy and no module default
    const result = await this.rateLimiter.check(ctx, options);

    setResponseHeader(execCtx, 'X-RateLimit-Limit', String(result.limit));
    setResponseHeader(execCtx, 'X-RateLimit-Remaining', String(result.remaining));
    setResponseHeader(execCtx, 'X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      const retrySec = Math.ceil(result.retryAfterMs / 1000);
      setResponseHeader(execCtx, 'Retry-After', String(retrySec));
      await this.emit('RATE_LIMIT_BLOCKED', ctx, { limit: result.limit });
      throw new RateLimitedError(result.retryAfterMs);
    }
  }
}
