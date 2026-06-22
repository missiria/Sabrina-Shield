import type { RequestContext } from '../interfaces/request-context';
import type { GeoProvider } from '../interfaces/geo';
import type { BotDetector } from '../security/bot/bot-detector';
import type { RiskAssessment, RiskBreakdownEntry, RiskContext, RiskRule } from './types';

export interface RiskEngineOptions {
  /** Rules to evaluate. */
  rules: RiskRule[];
  /** Score at or above which the request is blocked (default 100). */
  threshold?: number;
  /** Optional geo provider used to enrich the risk context. */
  geoProvider?: GeoProvider;
  /** Optional bot detector used to enrich the risk context. */
  botDetector?: BotDetector;
}

/**
 * Rule-based risk scorer. Enriches the request with geo + bot signals (when
 * providers are configured), sums each rule's contribution, and blocks when the
 * total reaches the threshold.
 */
export class RiskEngine {
  private readonly rules: RiskRule[];
  private readonly threshold: number;
  private readonly geoProvider?: GeoProvider;
  private readonly botDetector?: BotDetector;

  constructor(options: RiskEngineOptions) {
    this.rules = options.rules;
    this.threshold = options.threshold ?? 100;
    this.geoProvider = options.geoProvider;
    this.botDetector = options.botDetector;
  }

  async assess(request: RequestContext): Promise<RiskAssessment> {
    const ctx: RiskContext = { request };
    if (this.geoProvider) ctx.geo = await this.geoProvider.lookup(request.ip);
    if (this.botDetector) ctx.bot = this.botDetector.detect(request);

    const breakdown: RiskBreakdownEntry[] = [];
    let score = 0;
    for (const rule of this.rules) {
      const value = await rule.evaluate(ctx);
      if (value !== 0) breakdown.push({ rule: rule.name, score: value });
      score += value;
    }

    return { score, threshold: this.threshold, blocked: score >= this.threshold, breakdown };
  }
}
