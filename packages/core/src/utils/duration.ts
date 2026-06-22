const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** A human duration like `'500ms'`, `'30s'`, `'1m'`, `'2h'`, `'1d'`, or a number of ms. */
export type Duration = number | string;

/**
 * Parse a {@link Duration} into milliseconds.
 * Numbers pass through unchanged. Strings must be `<number><unit>` where unit is
 * one of `ms | s | m | h | d`.
 *
 * @throws if the string is malformed or the value is negative.
 */
export function parseDuration(input: Duration): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error(`Invalid duration: ${input}`);
    }
    return input;
  }

  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration string: "${input}". Expected e.g. "100ms", "30s", "1m".`);
  }
  const value = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MS;
  return value * UNIT_MS[unit]!;
}
