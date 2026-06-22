# PLANNING.md

# Sabrina Shield

> An open-source, framework-first security toolkit for NestJS APIs and web applications.

---

# Vision

Build **Sabrina Shield**, a modern, extensible, production-ready security library for NestJS that helps developers secure
APIs with minimal configuration while remaining fully customizable.

The project should be framework-agnostic at its core and expose a first-class NestJS integration.

The philosophy is:

- Secure by default
- Zero vendor lock-in
- Modular architecture
- High performance
- Developer Experience first
- Open Source (MIT)
- SOLID
- Clean Architecture
- Hexagonal Architecture
- Dependency Injection
- 100% TypeScript

---

# Target users

- NestJS developers
- SaaS applications
- APIs
- Microservices
- WordPress Headless APIs
- Enterprise applications
- Startups

---

# Repository Architecture

```
sabrina-shield/

├── packages/
│
├── core/
│   ├── rate-limit/
│   ├── api-key/
│   ├── audit/
│   ├── fingerprint/
│   ├── security/
│   ├── headers/
│   ├── cache/
│   ├── risk-engine/
│   ├── interfaces/
│   ├── errors/
│   └── utils/
│
├── nest/
│   ├── module/
│   ├── guards/
│   ├── decorators/
│   ├── interceptors/
│   ├── filters/
│   ├── providers/
│   └── pipes/
│
├── redis/
│
├── express/
│
├── fastify/
│
├── examples/
│
├── docs/
│
├── tests/
│
└── scripts/
```

---

# MVP Features

## 1. Rate Limiter

Support multiple algorithms.

- Fixed Window
- Sliding Window
- Token Bucket
- Leaky Bucket

Configurable per:

- IP
- User ID
- API Key
- Route
- Header
- Device Fingerprint

Example

```ts
@RateLimit({
    max: 100,
    window: '1m'
})
```

---

## 2. API Key Guard

Support

- Header authentication
- Multiple keys
- Prefix support

```
Authorization: ApiKey xxxxxxxxx
```

or

```
x-api-key
```

---

## 3. Security Headers

Automatically configure

- CSP
- HSTS
- XSS Protection
- Referrer Policy
- Permissions Policy
- Frame Options

---

## 4. Audit Logs

Every request may emit events.

Example

```
LOGIN_SUCCESS
LOGIN_FAILED
RATE_LIMIT_BLOCKED
API_KEY_INVALID
```

Storage should be pluggable.

---

## 5. Redis Store

Provide

Memory Store

Redis Store

Interface

```
RateLimitStore
```

Developers can implement MongoDB, PostgreSQL, DynamoDB, etc.

---

## 6. Risk Engine

Simple scoring system.

Example

```
Tor exit node

+40

VPN

+15

Bad User-Agent

+20

Known scanner

+30

Country blocked

+100
```

Above threshold:

```
403
```

---

## 7. Fingerprinting

Generate anonymous fingerprints using

- IP
- Accept Language
- User Agent
- Timezone
- Screen hints (optional)

No cookies required.

---

## 8. Bot Detection

Detect

- curl
- wget
- Python requests
- sqlmap
- nikto
- nmap
- zap
- Burp Suite

Allow custom signatures.

---

## 9. IP Blocklist

Support

Temporary block

Permanent block

CIDR

IPv4

IPv6

---

## 10. Request Size Protection

Prevent

Large JSON

Multipart abuse

Huge uploads

Payload attacks

---

## 11. Abuse Detection

Detect

Credential stuffing

Brute force

Enumeration

Spam

Rapid scanning

---

## 12. Exception Filter

Return standardized JSON

```json
{
  "success": false,
  "code": "RATE_LIMITED",
  "message": "Too many requests."
}
```

---

# NestJS API

```ts
imports: [
  SabrinaShieldModule.forRoot({
    rateLimit: {
      default: {
        max: 100,

        window: '1m',
      },

      store: new RedisStore(),
    },

    headers: true,

    audit: true,

    apiKeys: true,
  }),
];
```

---

# Decorators

```
@RateLimit()

@NoRateLimit()

@Public()

@ApiKey()

@Risk()

@Audit()

@AllowCountry()

@BlockCountry()

@BlockIp()

@RequireRole()

@SkipAudit()
```

---

# Future Modules

- OAuth Protection
- JWT Hardening
- Session Security
- Webhook Signature Validation
- DDoS Detection
- CSRF Protection
- CORS Builder
- Signed URLs
- Request Replay Protection
- Secret Rotation
- Geo Blocking
- ASN Blocking
- Honeypot
- CAPTCHA Adapter
- Email Reputation
- Threat Intelligence
- OWASP Rules
- Cloudflare Integration
- Fail2Ban Integration
- OpenTelemetry Metrics
- Prometheus Metrics
- Grafana Dashboard

---

# Design Principles

- SOLID
- DRY
- KISS
- Composition over inheritance
- Dependency Injection
- Immutable configuration
- Framework agnostic core
- Tree-shakable packages
- Async-first
- Promise-based APIs
- Zero runtime reflection when possible

---

# Quality Requirements

- 95%+ unit test coverage
- Integration tests
- E2E tests
- ESLint
- Prettier
- Husky
- Conventional Commits
- Changesets
- Semantic Versioning
- GitHub Actions CI/CD
- Typedoc documentation
- API Extractor
- pnpm workspace

---

# Documentation

Provide comprehensive documentation including

- Installation
- Quick Start
- NestJS Integration
- Redis Integration
- Rate Limiting
- API Keys
- Security Headers
- Audit Logs
- Custom Stores
- Custom Guards
- Custom Strategies
- Plugin Development

---

# Long-Term Vision

Sabrina Shield should become the security equivalent of:

- Passport.js for authentication
- Helmet for HTTP headers
- express-rate-limit for throttling

...but designed from day one for modern TypeScript, NestJS, Clean Architecture, cloud-native deployments, and extensibility.

The project should evolve into a complete security ecosystem with optional plugins while keeping the core lightweight, fast,
and dependency-minimal.
