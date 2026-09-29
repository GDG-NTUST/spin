import { describe, expect, it } from 'vitest';
import { assignColors } from '../src/wheel/colors';

const noClash = (c: number[]) =>
  c.length < 2 || c.every((x, i) => x !== c[(i + 1) % c.length]);

describe('assignColors', () => {
  it('cycles the four colours for a fresh list', () => {
    expect(assignColors(new Array(8).fill(null))).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('never gives neighbours (including last ↔ first) the same colour', () => {
    for (let n = 1; n <= 60; n++) expect(noClash(assignColors(new Array(n).fill(null)))).toBe(true);
  });

  it('keeps existing colours and only repairs clashes after a removal', () => {
    const before = assignColors(new Array(8).fill(null)); // 0 1 2 3 0 1 2 3
    const after = before.filter((_, i) => i !== 1); // 0 2 3 0 1 2 3  → no clash
    expect(assignColors(after)).toEqual(after);
    const clash = [0, 1, 1, 2]; // one clash in the middle
    const fixed = assignColors(clash);
    expect(noClash(fixed)).toBe(true);
    expect(fixed.filter((c, i) => c !== clash[i])).toHaveLength(1);
  });

  it('fills new slices between existing ones without clashing', () => {
    const r = assignColors([0, null, 1, null, 3]);
    expect(noClash(r)).toBe(true);
    expect([r[0], r[2], r[4]]).toEqual([0, 1, 3]);
  });
});
