import { Global, Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TOKENS } from './constants';
import { buildEngineProviders } from './providers';
import { ShieldGuard } from './shield.guard';
import { SecurityHeadersInterceptor, AuditInterceptor } from './interceptors';
import { ShieldExceptionFilter } from './exception.filter';
import type { SabrinaShieldAsyncOptions, SabrinaShieldOptions } from './options';

const EXPORTED_TOKENS = [
  TOKENS.rateLimiter,
  TOKENS.apiKeyValidator,
  TOKENS.auditService,
  TOKENS.riskEngine,
  TOKENS.botDetector,
  TOKENS.blocklist,
  TOKENS.requestSizeGuard,
  TOKENS.geoProvider,
];

function appProviders(useGlobalGuards: boolean): Provider[] {
  const providers: Provider[] = [
    ShieldGuard,
    { provide: APP_INTERCEPTOR, useClass: SecurityHeadersInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: ShieldExceptionFilter },
  ];
  if (useGlobalGuards) providers.push({ provide: APP_GUARD, useClass: ShieldGuard });
  return providers;
}

/**
 * Root module wiring Sabrina Shield into a NestJS app. Registers engine
 * singletons, the global {@link ShieldGuard}, security-header + audit
 * interceptors, and the {@link ShieldExceptionFilter}. Marked `@Global` so the
 * engine tokens can be injected anywhere.
 */
@Global()
@Module({})
export class SabrinaShieldModule {
  static forRoot(options: SabrinaShieldOptions): DynamicModule {
    return {
      module: SabrinaShieldModule,
      providers: [
        { provide: TOKENS.options, useValue: options },
        ...buildEngineProviders(),
        ...appProviders(options.useGlobalGuards !== false),
      ],
      exports: [...EXPORTED_TOKENS, ShieldGuard],
    };
  }

  static forRootAsync(async: SabrinaShieldAsyncOptions): DynamicModule {
    return {
      module: SabrinaShieldModule,
      imports: async.imports ?? [],
      providers: [
        { provide: TOKENS.options, useFactory: async.useFactory, inject: async.inject ?? [] },
        ...buildEngineProviders(),
        // Global guard is always registered in async mode; toggle via metadata if needed.
        ...appProviders(true),
      ],
      exports: [...EXPORTED_TOKENS, ShieldGuard],
    };
  }
}
