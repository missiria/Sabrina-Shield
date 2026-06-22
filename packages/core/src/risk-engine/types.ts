import type { RequestContext } from '../interfaces/request-context';
import type { GeoInfo } from '../interfaces/geo';
import type { BotDetectionResult } from '../security/bot/bot-detector';

/** Signals available to risk rules. */
export interface RiskContext {
  request: RequestContext;
  /** Geo/network metadata, when a GeoProvider is configured. */
  geo?: GeoInfo;
  /** Bot detection result, when a BotDetector is configured. */
  bot?: BotDetectionResult;
}

/** A single composable risk rule that contributes a score. */
export interface RiskRule {
  readonly name: string;
  /** Return points to add (0 when the rule does not apply). */
  evaluate(ctx: RiskContext): number | Promise<number>;
}

export interface RiskBreakdownEntry {
  rule: string;
  score: number;
}

export interface RiskAssessment {
  score: number;
  threshold: number;
  blocked: boolean;
  breakdown: RiskBreakdownEntry[];
}
