import type { Provider } from '@nestjs/common';
import {
  RateLimiter,
  ApiKeyValidator,
  AuditService,
  ConsoleAuditSink,
  RiskEngine,
  BotDetector,
  IpBlocklist,
  RequestSizeGuard,
  MemoryStore,
  type GeoProvider,
} from '@eksneks/core';
import { TOKENS } from './constants';
import type { SabrinaShieldOptions } from './options';

/**
 * Build the DI providers for every engine from the resolved module options.
 * Engines are created once and shared (singletons) across guards/interceptors.
 */
export function buildEngineProviders(): Provider[] {
  return [
    {
      provide: TOKENS.geoProvider,
      inject: [TOKENS.options],
      useFactory: (o: SabrinaShieldOptions): GeoProvider | undefined => o.geoProvider,
    },
    {
      provide: TOKENS.rateLimiter,
      inject: [TOKENS.options],
      useFactory: (o: SabrinaShieldOptions) =>
        o.rateLimit
          ? new RateLimiter({
              store: o.rateLimit.store ?? new MemoryStore({ sweepIntervalMs: 30_000 }),
            })
          : undefined,
    },
    {
      provide: TOKENS.apiKeyValidator,
      inject: [TOKENS.options],
      useFactory: (o: SabrinaShieldOptions) =>
        o.apiKeys ? new ApiKeyValidator(o.apiKeys) : undefined,
    },
    {
      provide: TOKENS.auditService,
      inject: [TOKENS.options],
      useFactory: (o: SabrinaShieldOptions) => {
        if (!o.audit) return undefined;
        const sink =
          o.audit === true ? new ConsoleAuditSink() : (o.audit.sink ?? new ConsoleAuditSink());
        return new AuditService({ sink });
      },
    },
    {
      provide: TOKENS.botDetector,
      inject: [TOKENS.options],
      useFactory: (o: SabrinaShieldOptions) =>
        o.bot ? new BotDetector(o.bot === true ? {} : o.bot) : undefined,
    },
    {
      provide: TOKENS.riskEngine,
      inject: [TOKENS.options, TOKENS.botDetector],
      useFactory: (o: SabrinaShieldOptions, bot?: BotDetector) =>
        o.risk
          ? new RiskEngine({
              rules: o.risk.rules,
              threshold: o.risk.threshold,
              geoProvider: o.geoProvider,
              botDetector: bot,
            })
          : undefined,
    },
    {
      provide: TOKENS.blocklist,
      inject: [TOKENS.options],
      useFactory: (o: SabrinaShieldOptions) =>
        o.blocklist ? new IpBlocklist(o.blocklist) : undefined,
    },
    {
      provide: TOKENS.requestSizeGuard,
      inject: [TOKENS.options],
      useFactory: (o: SabrinaShieldOptions) =>
        o.requestSize
          ? new RequestSizeGuard(o.requestSize === true ? {} : o.requestSize)
          : undefined,
    },
  ];
}
