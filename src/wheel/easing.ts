/** Cubic ease-out for JS-driven tweens (matches the feel of --ease-out). */
export const EASE_OUT_FN = (t: number): number => 1 - (1 - t) ** 3;
