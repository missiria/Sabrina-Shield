import { createHash, timingSafeEqual } from 'node:crypto';

/** Hex-encoded SHA-256 of the input. */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Constant-time string comparison. Returns false for length mismatch without
 * leaking timing. Use for API keys / secrets.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still compare against self to keep timing roughly constant.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
