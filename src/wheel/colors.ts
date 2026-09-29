export type RGB = readonly [number, number, number];

/** Google blue, red, yellow, green — in wheel order. */
export const PALETTE: readonly RGB[] = [
  [66, 133, 244],
  [234, 67, 53],
  [251, 188, 4],
  [52, 168, 83],
];

/** Label colour per palette slot (dark text on yellow for contrast). */
export const LABEL_COLORS = ['#ffffff', '#ffffff', '#202124', '#ffffff'];

/**
 * Give every slice a palette index so that no two neighbours match — including
 * the last/first pair, since the wheel is a ring. Existing colours are kept
 * unless they now clash (e.g. after a removal), so slices don't flicker.
 */
export function assignColors(current: readonly (number | null)[], k = PALETTE.length): number[] {
  const n = current.length;
  const out = current.slice();
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? out[i - 1] : n > 1 ? out[n - 1] : null;
    const next = i < n - 1 ? out[i + 1] : n > 1 ? out[0] : null;
    const clashes = (c: number) => n > 1 && (c === prev || c === next);
    let c = out[i];
    if (c === null || clashes(c)) {
      const start = prev === null ? 0 : prev + 1;
      c = start % k;
      for (let j = 0; j < k; j++) {
        const cand = (start + j) % k;
        if (!clashes(cand)) {
          c = cand;
          break;
        }
      }
    }
    out[i] = c;
  }
  return out as number[];
}
