/** Metadata keys set by decorators and read by guards/interceptors. */
export const METADATA = {
  rateLimit: 'sabrina:rate-limit',
  noRateLimit: 'sabrina:no-rate-limit',
  public: 'sabrina:public',
  apiKey: 'sabrina:api-key',
  risk: 'sabrina:risk',
  audit: 'sabrina:audit',
  skipAudit: 'sabrina:skip-audit',
  allowCountry: 'sabrina:allow-country',
  blockCountry: 'sabrina:block-country',
  blockIp: 'sabrina:block-ip',
  requireRole: 'sabrina:require-role',
} as const;

/** DI tokens for engine instances built by the module. */
export const TOKENS = {
  options: 'SABRINA_SHIELD_OPTIONS',
  rateLimiter: 'SABRINA_RATE_LIMITER',
  apiKeyValidator: 'SABRINA_API_KEY_VALIDATOR',
  auditService: 'SABRINA_AUDIT_SERVICE',
  riskEngine: 'SABRINA_RISK_ENGINE',
  botDetector: 'SABRINA_BOT_DETECTOR',
  blocklist: 'SABRINA_BLOCKLIST',
  requestSizeGuard: 'SABRINA_REQUEST_SIZE_GUARD',
  geoProvider: 'SABRINA_GEO_PROVIDER',
} as const;
