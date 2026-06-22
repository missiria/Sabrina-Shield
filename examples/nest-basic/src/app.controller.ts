import { Controller, Get, Post } from '@nestjs/common';
import { RateLimit, ApiKey, Public, BlockCountry } from '@sabrina-shield/nest';

@Controller()
export class AppController {
  // Inherits the module's default rate limit.
  @Get()
  index() {
    return { message: 'Hello from Sabrina Shield' };
  }

  // Tighter per-route limit: 5 requests/minute.
  @Get('search')
  @RateLimit({ max: 5, window: '1m' })
  search() {
    return { results: [] };
  }

  // Requires `x-api-key` (or `Authorization: ApiKey <key>`).
  @Post('internal')
  @ApiKey()
  internal() {
    return { ok: true };
  }

  // Block specific countries (requires a GeoProvider in the module config).
  @Get('geo')
  @BlockCountry('KP', 'RU')
  geo() {
    return { ok: true };
  }

  // Health checks bypass all auth-style guards and rate limiting.
  @Get('health')
  @Public()
  health() {
    return { status: 'up' };
  }
}
