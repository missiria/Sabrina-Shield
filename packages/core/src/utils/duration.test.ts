import { describe, it, expect } from 'vitest';
import { parseDuration } from './duration';

describe('parseDuration', () => {
  it('passes through non-negative numbers', () => {
    expect(parseDuration(0)).toBe(0);
    expect(parseDuration(1500)).toBe(1500);
  });

  it('parses unit strings', () => {
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('1m')).toBe(60_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('1d')).toBe(86_400_000);
  });

  it('tolerates whitespace and decimals', () => {
    expect(parseDuration(' 1.5s ')).toBe(1500);
  });

  it('throws on malformed strings', () => {
    expect(() => parseDuration('1y')).toThrow();
    expect(() => parseDuration('abc')).toThrow();
    expect(() => parseDuration('')).toThrow();
  });

  it('throws on invalid numbers', () => {
    expect(() => parseDuration(-1)).toThrow();
    expect(() => parseDuration(Number.NaN)).toThrow();
  });
});
