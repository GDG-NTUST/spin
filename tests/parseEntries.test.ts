import { describe, expect, it } from 'vitest';
import { duplicateIndices, mergeNames, nameKey, parseEntries } from '../src/lib/parseEntries';

describe('parseEntries', () => {
  it.each([
    ['newline', 'A\nB\nC'],
    ['CRLF', 'A\r\nB\r\nC'],
    ['half-width comma', 'A,B,C'],
    ['full-width comma', 'A，B，C'],
    ['ideographic comma', 'A、B、C'],
    ['pipe', 'A|B|C'],
    ['tab', 'A\tB\tC'],
    ['half-width semicolon', 'A;B;C'],
    ['full-width semicolon', 'A；B；C'],
  ])('splits on %s', (_, input) => {
    expect(parseEntries(input)).toEqual(['A', 'B', 'C']);
  });

  it('handles every separator mixed together', () => {
    const input = '王小明\n李大華,陳美玲，林志強、張雅婷|黃俊傑\t吳佩珊;鄭家豪；周怡君';
    expect(parseEntries(input)).toEqual([
      '王小明', '李大華', '陳美玲', '林志強', '張雅婷', '黃俊傑', '吳佩珊', '鄭家豪', '周怡君',
    ]);
  });

  it('trims whitespace (including full-width spaces) and skips empty items', () => {
    expect(parseEntries('  A  ,, ,\n\n　B　 ;;| \t C ')).toEqual(['A', 'B', 'C']);
  });

  it('keeps inner spaces in names', () => {
    expect(parseEntries('Ada Lovelace, Alan  Turing')).toEqual(['Ada Lovelace', 'Alan  Turing']);
  });

  it('returns [] for empty or separator-only input', () => {
    expect(parseEntries('')).toEqual([]);
    expect(parseEntries(' \n,，、|\t;； ')).toEqual([]);
  });

  it('removes duplicates by default, keeping the first occurrence', () => {
    expect(parseEntries('A,B,A,C,B')).toEqual(['A', 'B', 'C']);
  });

  it('treats case and full-/half-width variants as duplicates', () => {
    expect(parseEntries('alice, ALICE, ａｌｉｃｅ, Bob')).toEqual(['alice', 'Bob']);
  });

  it('keeps duplicates when dedupe is off', () => {
    expect(parseEntries('A,B,A', { dedupe: false })).toEqual(['A', 'B', 'A']);
  });
});

describe('nameKey', () => {
  it('normalises width, case and whitespace', () => {
    expect(nameKey(' Ａda  LOVELACE ')).toBe('ada lovelace');
  });
});

describe('mergeNames', () => {
  it('skips names already in the pool when dedupe is on', () => {
    expect(mergeNames(['A', 'B'], ['b', 'C', 'C'], true)).toEqual({ added: ['C'], skipped: 2 });
  });

  it('adds everything when dedupe is off', () => {
    expect(mergeNames(['A'], ['A', 'A'], false)).toEqual({ added: ['A', 'A'], skipped: 0 });
  });
});

describe('duplicateIndices', () => {
  it('lists every repeat after the first occurrence', () => {
    expect(duplicateIndices(['A', 'B', 'a', 'C', 'B', 'A'])).toEqual([2, 4, 5]);
  });
});
