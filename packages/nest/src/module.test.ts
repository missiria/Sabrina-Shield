import { describe, it, expect } from 'vitest';
import { APP_GUARD } from '@nestjs/core';
import { SabrinaShieldModule } from './module';
import { ShieldGuard } from './shield.guard';
import { TOKENS } from './constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const provides = (m: any) => m.providers.map((p: any) => p.provide ?? p);

describe('SabrinaShieldModule.forRoot', () => {
  it('registers options, engines, and the global guard', () => {
    const mod = SabrinaShieldModule.forRoot({ rateLimit: {} });
    expect(mod.module).toBe(SabrinaShieldModule);
    const tokens = provides(mod);
    expect(tokens).toContain(TOKENS.options);
    expect(tokens).toContain(TOKENS.rateLimiter);
    expect(tokens).toContain(APP_GUARD);
    expect(mod.exports).toContain(ShieldGuard);
  });

  it('omits the global guard when useGlobalGuards is false', () => {
    const mod = SabrinaShieldModule.forRoot({ useGlobalGuards: false });
    expect(provides(mod)).not.toContain(APP_GUARD);
  });
});

describe('SabrinaShieldModule.forRootAsync', () => {
  it('wires the async options factory and imports', () => {
    const mod = SabrinaShieldModule.forRootAsync({
      imports: [],
      inject: [],
      useFactory: () => ({ rateLimit: {} }),
    });
    const optionProvider = mod.providers!.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => p.provide === TOKENS.options,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    expect(typeof optionProvider.useFactory).toBe('function');
    expect(provides(mod)).toContain(APP_GUARD);
  });
});
