# Sabrina Shield — 48 Strict MVP Test Scenarios

## A. Rate Limiting Tests

### 1. Basic IP rate limit

Send more requests than allowed from the same IP within the configured window.

Expected result: requests above the limit are blocked.

### 2. Rate limit reset

Reach the limit, wait until the window expires, then send another request.

Expected result: request is allowed after reset.

### 3. Boundary request

If limit is 100 requests, send exactly 100 requests.

Expected result: all 100 are allowed, request 101 is blocked.

### 4. Burst traffic

Send many requests at the same millisecond.

Expected result: limiter still counts correctly.

### 5. Parallel requests

Send concurrent requests from the same IP.

Expected result: no race condition allows extra requests.

### 6. Different IP isolation

Send requests from two different IPs.

Expected result: one IP being blocked does not block the other.

### 7. Per-route limits

Configure different limits for `/login` and `/products`.

Expected result: each route respects its own limit.

### 8. Global limit fallback

Use an endpoint without custom rate-limit config.

Expected result: global default limit is applied.

### 9. Disabled route limit

Mark one route as no-rate-limit.

Expected result: limiter skips that route only.

### 10. User-based rate limit

Send requests from the same authenticated user using different IPs.

Expected result: user-level limit blocks abuse.

### 11. API-key-based rate limit

Send requests using the same API key from different IPs.

Expected result: API key limit is enforced.

### 12. Missing identity key

Request has no user, no API key, and no reliable IP.

Expected result: request is handled safely, not silently unlimited.

---

## B. Redis Store Tests

### 13. Redis unavailable

Start app when Redis is down.

Expected result: clear failure or safe fallback based on config.

### 14. Redis disconnect during traffic

Redis disconnects while requests are being processed.

Expected result: system fails safely, not open by default.

### 15. Redis latency spike

Redis responds slowly.

Expected result: request handling does not hang indefinitely.

### 16. Redis TTL accuracy

Check whether counters expire exactly after configured window.

Expected result: TTL matches expected behavior.

### 17. Redis key collision

Two routes/users accidentally generate similar keys.

Expected result: no cross-contamination between limits.

### 18. Redis multi-instance consistency

Run two API instances sharing the same Redis.

Expected result: rate limits are shared correctly.

### 19. Redis memory pressure

Redis starts evicting keys.

Expected result: library behavior is documented and safe.

### 20. Store interface failure

Custom store throws an error.

Expected result: error is handled predictably.

---

## C. API Key Tests

### 21. Valid API key

Send request with a valid API key.

Expected result: request is allowed.

### 22. Missing API key

Call protected route without API key.

Expected result: request is rejected.

### 23. Invalid API key

Send random invalid API key.

Expected result: request is rejected.

### 24. Empty API key

Send empty `x-api-key` header.

Expected result: request is rejected.

### 25. Whitespace API key

Send API key with leading/trailing spaces.

Expected result: behavior is consistent and secure.

### 26. Case sensitivity

Send API key with changed casing.

Expected result: key validation follows documented behavior.

### 27. Duplicate API key headers

Send multiple API key headers.

Expected result: request is rejected or handled safely.

### 28. API key on public route

Send API key to a route that does not require one.

Expected result: route works normally without privilege confusion.

---

## D. IP Blocking Tests

### 29. Blocked IP

Send request from blocked IP.

Expected result: request is rejected.

### 30. Allowed IP

Send request from normal IP.

Expected result: request is allowed.

### 31. CIDR block

Block a CIDR range and send request from inside that range.

Expected result: request is rejected.

### 32. IPv6 block

Block an IPv6 address.

Expected result: IPv6 blocking works correctly.

### 33. Spoofed X-Forwarded-For

Send fake `X-Forwarded-For` header.

Expected result: spoofing does not bypass IP rules.

### 34. Trusted proxy mode

Enable trusted proxy and test real client IP extraction.

Expected result: real client IP is detected correctly.

### 35. Invalid IP format

Send malformed IP data.

Expected result: library does not crash.

### 36. Temporary IP block expiry

Temporarily block an IP, wait for expiry.

Expected result: IP is allowed after expiry.

---

## E. Security Headers Tests

### 37. Default headers

Call normal route.

Expected result: security headers are present.

### 38. Disabled headers

Disable security headers in config.

Expected result: headers are not added.

### 39. Custom CSP

Set custom Content Security Policy.

Expected result: custom CSP is applied exactly.

### 40. Existing header conflict

Application already sets a security header.

Expected result: documented precedence is respected.

---

## F. Audit Log Tests

### 41. Successful request audit

Call protected route successfully.

Expected result: audit event is created.

### 42. Blocked request audit

Trigger rate limit block.

Expected result: blocked event is logged.

### 43. Invalid API key audit

Send invalid API key.

Expected result: invalid key event is logged.

### 44. Audit logger failure

Audit storage fails.

Expected result: request flow does not crash unless configured strict.

---

## G. Bot & Abuse Detection Tests

### 45. Known scanner user-agent

Send request using `sqlmap`, `nikto`, or `curl` user-agent.

Expected result: risk score increases or request is blocked based on config.

### 46. Empty user-agent

Send request without user-agent.

Expected result: request is handled based on configured risk rules.

### 47. Rapid endpoint scanning

Hit many unknown routes quickly.

Expected result: suspicious behavior is detected.

### 48. Login enumeration

Try many different emails on login from same IP.

Expected result: abuse detection blocks or flags enumeration.
