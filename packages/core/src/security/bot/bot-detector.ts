import { getHeader, type RequestContext } from '../../interfaces/request-context';

export interface BotSignature {
  /** Label for the matched tool/category, e.g. `sqlmap`. */
  name: string;
  /** Case-insensitive pattern tested against the User-Agent. */
  pattern: RegExp;
  /** Coarse category for reporting. */
  category?: 'tool' | 'scanner' | 'library' | 'crawler' | 'custom';
}

export interface BotDetectionResult {
  isBot: boolean;
  /** Matched signature, when `isBot` is true. */
  signature?: BotSignature;
}

/** Built-in signatures for common non-browser clients and attack tools. */
export const DEFAULT_BOT_SIGNATURES: BotSignature[] = [
  { name: 'curl', pattern: /\bcurl\//i, category: 'tool' },
  { name: 'wget', pattern: /\bwget\b/i, category: 'tool' },
  { name: 'python-requests', pattern: /python-requests/i, category: 'library' },
  { name: 'python-urllib', pattern: /python-urllib|urllib/i, category: 'library' },
  { name: 'go-http-client', pattern: /go-http-client/i, category: 'library' },
  { name: 'sqlmap', pattern: /sqlmap/i, category: 'scanner' },
  { name: 'nikto', pattern: /nikto/i, category: 'scanner' },
  { name: 'nmap', pattern: /nmap|masscan/i, category: 'scanner' },
  { name: 'zap', pattern: /\bzap\b|owasp/i, category: 'scanner' },
  { name: 'burp', pattern: /burp(suite)?/i, category: 'scanner' },
  { name: 'nessus', pattern: /nessus/i, category: 'scanner' },
];

export interface BotDetectorOptions {
  /** Replace the default signatures entirely. */
  signatures?: BotSignature[];
  /** Append extra signatures to the defaults. */
  extraSignatures?: BotSignature[];
  /** Treat an empty/missing User-Agent as a bot (default false). */
  blockEmptyUserAgent?: boolean;
}

/** Detects automated clients via User-Agent signature matching. */
export class BotDetector {
  private readonly signatures: BotSignature[];
  private readonly blockEmptyUserAgent: boolean;

  constructor(options: BotDetectorOptions = {}) {
    this.signatures = [
      ...(options.signatures ?? DEFAULT_BOT_SIGNATURES),
      ...(options.extraSignatures ?? []),
    ];
    this.blockEmptyUserAgent = options.blockEmptyUserAgent ?? false;
  }

  detect(ctx: RequestContext): BotDetectionResult {
    const ua = getHeader(ctx, 'user-agent')?.trim() ?? '';
    if (!ua) {
      return this.blockEmptyUserAgent
        ? {
            isBot: true,
            signature: { name: 'empty-user-agent', pattern: /^$/, category: 'custom' },
          }
        : { isBot: false };
    }
    for (const signature of this.signatures) {
      if (signature.pattern.test(ua)) return { isBot: true, signature };
    }
    return { isBot: false };
  }
}
