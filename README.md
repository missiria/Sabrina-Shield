# 🛡️ Sabrina Shield

> **The modern security toolkit for NestJS APIs.**
> Protect your applications against brute-force attacks, abuse, bots, and common API threats with a modular,
> high-performance, open-source security framework.

<p align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![NestJS](https://img.shields.io/badge/NestJS-Compatible-red)
![Node](https://img.shields.io/badge/Node.js-18%2B-green)
![Redis](https://img.shields.io/badge/Redis-Optional-red)
![Tests](https://img.shields.io/badge/Test-Coverage-success)

</p>

---

# Why Sabrina Shield?

Modern APIs are constantly targeted by:

- Brute-force attacks
- Credential stuffing
- DDoS attempts
- API abuse
- Enumeration attacks
- Malicious bots
- Rate limit bypasses
- Automated scanners

Sabrina Shield provides production-ready security components designed specifically for **NestJS**, allowing developers to
secure APIs with minimal configuration while remaining fully extensible.

---

# Features

- 🚀 High-performance Rate Limiting
- 🔐 API Key Authentication
- 🌍 IP & Country Blocking
- 🤖 Bot Detection
- 🛡️ Security Headers
- 📊 Audit Logging
- ⚡ Redis Distributed Rate Limiting
- 🧠 Risk Scoring Engine
- 🪪 Device Fingerprinting
- 📦 Modular Architecture
- 🔌 Custom Storage Providers
- 🎯 Route-Level Security
- 🏗️ Framework-Agnostic Core
- ✅ 100% TypeScript

---

# Installation

```bash
npm install @eksneks/nest
```

or

```bash
pnpm add @eksneks/nest
```

---

# Quick Start

```ts
import { SabrinaShieldModule } from '@eksneks/nest';

@Module({
  imports: [
    SabrinaShieldModule.forRoot({
      rateLimit: {
        default: {
          max: 100,
          window: '1m',
        },
      },
    }),
  ],
})
export class AppModule {}
```

---

# Route Protection

```ts
@Get()
@RateLimit({
    max: 20,
    window: '1m',
})
findAll() {}
```

---

# Architecture

```text
Client
   │
   ▼
Cloudflare
   │
   ▼
Nginx
   │
   ▼
Sabrina Shield
   │
   ├── Rate Limiter
   ├── API Keys
   ├── Bot Detection
   ├── Risk Engine
   ├── Audit Logger
   ├── Security Headers
   └── Fingerprinting
   │
   ▼
NestJS Application
   │
   ▼
Database
```

---

# Modules

## Core

Framework-independent security engine.

## NestJS

Native decorators, guards, interceptors, and modules.

## Redis

Distributed rate limiting.

## Express

Express middleware.

## Fastify

Fastify adapter.

---

# Supported Algorithms

- Fixed Window
- Sliding Window
- Token Bucket
- Leaky Bucket

---

# Security Features

## Rate Limiting

Protect endpoints against abuse.

```ts
@RateLimit()
```

---

## API Keys

Protect internal services.

```ts
@ApiKey()
```

---

## IP Blocking

```ts
@BlockIp()
```

---

## Country Blocking

```ts
@BlockCountry()
```

---

## Security Headers

Automatically enables:

- CSP
- HSTS
- X-Frame-Options
- Referrer Policy
- Permissions Policy
- X-Content-Type-Options

---

## Audit Logs

Track:

- Failed logins
- Blocked requests
- Invalid API keys
- Rate-limit violations
- Suspicious traffic

---

## Redis Support

Perfect for:

- Kubernetes
- Docker Swarm
- Horizontal Scaling
- Multiple API Instances

---

# Philosophy

Sabrina Shield follows:

- SOLID
- Clean Architecture
- Hexagonal Architecture
- OWASP Best Practices
- Zero Vendor Lock-in
- Developer Experience First
- Security by Default

---

# Roadmap

- JWT Hardening
- CSRF Protection
- Webhook Signature Validation
- CAPTCHA Adapter
- ASN Blocking
- Threat Intelligence
- Honeypot
- OpenTelemetry Integration
- Prometheus Metrics
- Grafana Dashboard
- Cloudflare Integration
- Fail2Ban Integration
- Dashboard UI

---

# Contributing

Contributions are welcome!

Whether it's:

- Bug fixes
- Documentation
- New modules
- Performance improvements
- Security research

Feel free to open an Issue or Pull Request.

---

# License

MIT License

---

# Keywords

NestJS Security • NestJS Rate Limiter • API Security • Redis Rate Limiting • NestJS Middleware • OWASP • TypeScript Security
• API Protection • NestJS Guards • NestJS Authentication • Bot Detection • API Gateway • Express Security • Fastify Security
• Distributed Rate Limiting • Backend Security • Cybersecurity • Node.js Security

---

# Star the Project ⭐

If Sabrina Shield helps secure your APIs, consider giving the repository a ⭐ to support the project and help other
developers discover it.

www.eksneks.com By MISSIRIA
