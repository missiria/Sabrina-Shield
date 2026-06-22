import { getHeader } from '../interfaces/request-context';
import type { RiskRule } from './types';

/** +score when the IP is a known Tor exit node (requires GeoProvider). */
export function torExitNodeRule(score = 40): RiskRule {
  return { name: 'tor-exit-node', evaluate: (c) => (c.geo?.tor ? score : 0) };
}

/** +score when the IP belongs to a VPN/proxy (requires GeoProvider). */
export function vpnRule(score = 15): RiskRule {
  return { name: 'vpn', evaluate: (c) => (c.geo?.vpn ? score : 0) };
}

/** +score for a missing/suspicious User-Agent. */
export function badUserAgentRule(score = 20): RiskRule {
  return {
    name: 'bad-user-agent',
    evaluate: (c) => {
      const ua = getHeader(c.request, 'user-agent')?.trim();
      return !ua || ua.length < 8 ? score : 0;
    },
  };
}

/** +score when the bot detector flagged a known scanner/tool. */
export function knownScannerRule(score = 30): RiskRule {
  return {
    name: 'known-scanner',
    evaluate: (c) =>
      c.bot?.isBot &&
      (c.bot.signature?.category === 'scanner' || c.bot.signature?.category === 'tool')
        ? score
        : 0,
  };
}

/** +score when the request originates from a blocked country (requires GeoProvider). */
export function blockedCountryRule(countries: string[], score = 100): RiskRule {
  const set = new Set(countries.map((c) => c.toUpperCase()));
  return {
    name: 'blocked-country',
    evaluate: (c) => (c.geo?.country && set.has(c.geo.country.toUpperCase()) ? score : 0),
  };
}
