import { describe, expect, it } from 'vitest';
import { secureRandom, secureRandomInt } from '../src/lib/random';

describe('secureRandomInt', () => {
  it('stays within [0, n)', () => {
    for (const n of [1, 2, 3, 7, 40, 1000]) {
      for (let i = 0; i < 500; i++) {
        const x = secureRandomInt(n);
        expect(Number.isInteger(x) && x >= 0 && x < n).toBe(true);
      }
    }
  });

  it('rejects values in the biased tail', () => {
    // n = 3: limit = 2^32 - (2^32 % 3) = 4294967295; 4294967295 must be rejected.
    const seq = [2 ** 32 - 1, 2 ** 32 - 1, 5];
    expect(secureRandomInt(3, () => seq.shift()!)).toBe(5 % 3);
    expect(seq).toEqual([]);
  });

  it('is roughly uniform', () => {
    const n = 5;
    const counts = new Array(n).fill(0);
    const N = 50_000;
    for (let i = 0; i < N; i++) counts[secureRandomInt(n)]++;
    for (const c of counts) expect(Math.abs(c / N - 1 / n)).toBeLessThan(0.015);
  });

  it('throws on invalid n', () => {
    expect(() => secureRandomInt(0)).toThrow();
    expect(() => secureRandomInt(1.5)).toThrow();
  });
});

describe('secureRandom', () => {
  it('returns floats in [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const x = secureRandom();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });
});
