---
'@sabrina-shield/core': patch
---

Rate-limit `keyBy: 'fingerprint'` is now device-stable: it excludes the client
IP so the same device is still capped when it rotates IPs (proxies, VPNs,
mobile/Wi-Fi switching). Combine with the `ip` dimension when you want both
axes. Adds adversarial "IP-only bypass" scenario tests.
