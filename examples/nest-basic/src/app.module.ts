import { Module } from '@nestjs/common';
import { SabrinaShieldModule } from '@eksneks/nest';
import {
  torExitNodeRule,
  badUserAgentRule,
  knownScannerRule,
  blockedCountryRule,
} from '@eksneks/core';
import { AppController } from './app.controller';

// Swap the in-memory store for Redis in production:
//   import Redis from 'ioredis';
//   import { RedisStore } from '@eksneks/redis';
//   const store = new RedisStore(new Redis(process.env.REDIS_URL!));

@Module({
  imports: [
    SabrinaShieldModule.forRoot({
      rateLimit: {
        default: { max: 100, window: '1m' },
        // store, // <- new RedisStore(...) for distributed limiting
      },
      apiKeys: { keys: [process.env.API_KEY ?? 'dev-key'] },
      headers: true,
      audit: true,
      bot: true,
      requestSize: { maxBodyBytes: 1_000_000 },
      blocklist: { permanent: ['203.0.113.0/24'] },
      risk: {
        threshold: 100,
        rules: [
          torExitNodeRule(40),
          badUserAgentRule(20),
          knownScannerRule(30),
          blockedCountryRule(['KP'], 100),
        ],
      },
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
