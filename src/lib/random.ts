/** Fill a Uint32 from the platform CSPRNG. */
function randomUint32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/**
 * Uniform integer in [0, n) from `crypto.getRandomValues`.
 * Rejection sampling removes modulo bias.
 */
export function secureRandomInt(n: number, next: () => number = randomUint32): number {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new RangeError(`secureRandomInt: invalid n=${n}`);
  const limit = 2 ** 32 - (2 ** 32 % n); // largest multiple of n that fits
  let x: number;
  do x = next();
  while (x >= limit);
  return x % n;
}

/** Uniform float in [0, 1) from `crypto.getRandomValues`. */
export function secureRandom(): number {
  return randomUint32() / 2 ** 32;
}
