import type { KeyValueStore } from '../../interfaces/store';
import { getHeader, type RequestContext } from '../../interfaces/request-context';
import { normalizeIp } from '../../utils/ip';
import { parseDuration, type Duration } from '../../utils/duration';
import { generateFingerprint } from '../../fingerprint/fingerprint';

export type AbuseDimension = 'ip' | 'user' | 'fingerprint';

export interface AbuseRuleConfig {
  /** Max events allowed in the window before the rule trips. */
  max: number;
  /** Rolling window length. */
  window: Duration;
  /** What to count per (default `ip`); a function gives full control. */
  keyBy?: AbuseDimension | ((ctx: RequestContext) => string);
}

export interface AbuseResult {
  abusive: boolean;
  rule: string;
  count: number;
  max: number;
}

/**
 * Sensible defaults covering the common abuse patterns. Consumers record an
 * event against the relevant rule at the right place (e.g. `brute-force` on a
 * failed login, `enumeration` on a 404 for a resource id).
 */
export function defaultAbuseRules(): Record<string, AbuseRuleConfig> {
  return {
    'brute-force': { max: 5, window: '5m', keyBy: 'ip' },
    'credential-stuffing': { max: 10, window: '10m', keyBy: 'ip' },
    enumeration: { max: 30, window: '1m', keyBy: 'ip' },
    'rapid-scanning': { max: 100, window: '1m', keyBy: 'ip' },
    spam: { max: 20, window: '1m', keyBy: 'fingerprint' },
  };
}

export interface AbuseDetectorDeps {
  store: KeyValueStore;
  rules: Record<string, AbuseRuleConfig>;
  clock?: { now(): number };
}

/**
 * Counts events per rule within a rolling window and flags abuse when a
 * threshold is crossed. Detects credential stuffing, brute force, enumeration,
 * rapid scanning, and spam depending on the configured rules.
 */
export class AbuseDetector {
  constructor(private readonly deps: AbuseDetectorDeps) {}

  /** Record an event and return whether the rule is now tripped. */
  async record(ruleName: string, ctx: RequestContext): Promise<AbuseResult> {
    const rule = this.rule(ruleName);
    const key = this.key(ruleName, rule, ctx);
    const count = await this.deps.store.increment(key, 1, parseDuration(rule.window));
    return { abusive: count > rule.max, rule: ruleName, count, max: rule.max };
  }

  /** Read the current count without recording a new event. */
  async check(ruleName: string, ctx: RequestContext): Promise<AbuseResult> {
    const rule = this.rule(ruleName);
    const key = this.key(ruleName, rule, ctx);
    const count = (await this.deps.store.get<number>(key)) ?? 0;
    return { abusive: count > rule.max, rule: ruleName, count, max: rule.max };
  }

  private rule(name: string): AbuseRuleConfig {
    const rule = this.deps.rules[name];
    if (!rule) throw new Error(`Unknown abuse rule: ${name}`);
    return rule;
  }

  private key(ruleName: string, rule: AbuseRuleConfig, ctx: RequestContext): string {
    const dim = this.dimension(rule.keyBy ?? 'ip', ctx);
    return `abuse:${ruleName}:${dim}`;
  }

  private dimension(keyBy: NonNullable<AbuseRuleConfig['keyBy']>, ctx: RequestContext): string {
    if (typeof keyBy === 'function') return keyBy(ctx);
    switch (keyBy) {
      case 'user':
        return ctx.userId ?? getHeader(ctx, 'x-user-id') ?? '-';
      case 'fingerprint':
        return generateFingerprint(ctx);
      case 'ip':
      default:
        return normalizeIp(ctx.ip) || '-';
    }
  }
}
