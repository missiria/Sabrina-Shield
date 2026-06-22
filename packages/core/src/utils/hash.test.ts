import { describe, it, expect } from 'vitest';
import { sha256, safeEqual } from './hash';

describe('sha256', () => {
  it('produces stable hex digests', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('safeEqual', () => {
  it('returns true for identical strings', () => {
    expect(safeEqual('secret', 'secret')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(safeEqual('secret', 'secres')).toBe(false);
  });

  it('returns false for length mismatch', () => {
    expect(safeEqual('short', 'longer')).toBe(false);
  });
});
