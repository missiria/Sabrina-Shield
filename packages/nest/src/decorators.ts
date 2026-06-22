import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { RateLimitOptions } from '@sabrina-shield/core';
import { METADATA } from './constants';

/** Apply a rate limit to a route or controller. */
export const RateLimit = (options: RateLimitOptions): CustomDecorator =>
  SetMetadata(METADATA.rateLimit, options);

/** Exempt a route/controller from rate limiting. */
export const NoRateLimit = (): CustomDecorator => SetMetadata(METADATA.noRateLimit, true);

/** Mark a route/controller as public — skips API key and auth-style guards. */
export const Public = (): CustomDecorator => SetMetadata(METADATA.public, true);

/** Require a valid API key for the route/controller. */
export const ApiKey = (): CustomDecorator => SetMetadata(METADATA.apiKey, true);

/** Enable risk scoring for the route/controller (optional per-route threshold). */
export const Risk = (options?: { threshold?: number }): CustomDecorator =>
  SetMetadata(METADATA.risk, options ?? true);

/** Emit an audit event for the route, optionally overriding the event type. */
export const Audit = (type?: string): CustomDecorator => SetMetadata(METADATA.audit, type ?? true);

/** Skip audit logging for the route/controller. */
export const SkipAudit = (): CustomDecorator => SetMetadata(METADATA.skipAudit, true);

/** Allow only the given ISO country codes (requires a GeoProvider). */
export const AllowCountry = (...codes: string[]): CustomDecorator =>
  SetMetadata(METADATA.allowCountry, codes);

/** Block the given ISO country codes (requires a GeoProvider). */
export const BlockCountry = (...codes: string[]): CustomDecorator =>
  SetMetadata(METADATA.blockCountry, codes);

/** Block specific IPs/CIDRs for the route/controller. */
export const BlockIp = (...ips: string[]): CustomDecorator => SetMetadata(METADATA.blockIp, ips);

/** Require the request user to hold one of the given roles. */
export const RequireRole = (...roles: string[]): CustomDecorator =>
  SetMetadata(METADATA.requireRole, roles);
