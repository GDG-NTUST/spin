import { describe, expect, it } from 'vitest';
import {
  BOM, csvFileName, decodeCsvBytes, extractNamesFromCsv, formatDateTime, namesToCsv, resultsToCsv,
} from '../src/lib/csv';

describe('extractNamesFromCsv', () => {
  it('reads the first column when there is no header', () => {
    expect(extractNamesFromCsv('王小明,資工\n李大華,電機\n')).toEqual({
      names: ['王小明', '李大華'], hasHeader: false, column: 0,
    });
  });

  it('prefers a `name` column', () => {
    const csv = 'id,email,Name\n1,a@x.com,Alice\n2,b@x.com,Bob';
    expect(extractNamesFromCsv(csv)).toEqual({ names: ['Alice', 'Bob'], hasHeader: true, column: 2 });
  });

  it('prefers a `姓名` column', () => {
    const csv = '學號,姓名,系所\nB1,王小明,資工\nB2,李大華,電機';
    expect(extractNamesFromCsv(csv).names).toEqual(['王小明', '李大華']);
  });

  it('falls back to other name-like headers', () => {
    expect(extractNamesFromCsv('序號,參加者\n1,甲\n2,乙').names).toEqual(['甲', '乙']);
  });

  it('skips a non-name header row and reads the first column', () => {
    const r = extractNamesFromCsv('Email,Phone\na@x.com,0912\nb@x.com,0913');
    expect(r).toEqual({ names: ['a@x.com', 'b@x.com'], hasHeader: true, column: 0 });
  });

  it('handles BOM, CRLF, quotes and blank lines', () => {
    const csv = `${BOM}姓名\r\n"Lovelace, Ada"\r\n\r\n"Turing ""Alan"""\r\n,\r\n`;
    expect(extractNamesFromCsv(csv).names).toEqual(['Lovelace, Ada', 'Turing "Alan"']);
  });

  it('treats a single header-less row as a list of names', () => {
    expect(extractNamesFromCsv('A,B,C').names).toEqual(['A', 'B', 'C']);
  });

  it('returns nothing for empty input', () => {
    expect(extractNamesFromCsv('').names).toEqual([]);
    expect(extractNamesFromCsv('\n\n').names).toEqual([]);
  });

  it('round-trips an exported pool, including formula-like names', () => {
    const names = ['王小明', 'Lovelace, Ada', '=HYPERLINK("x")', '-dash', 'quote "q"'];
    expect(extractNamesFromCsv(namesToCsv(names))).toEqual({ names, hasHeader: true, column: 0 });
  });
});

describe('export', () => {
  it('namesToCsv starts with a UTF-8 BOM and uses CRLF', () => {
    expect(namesToCsv(['王小明', '李大華'])).toBe(`${BOM}姓名\r\n王小明\r\n李大華\r\n`);
  });

  it('escapes formula injection', () => {
    expect(namesToCsv(['=1+1'])).toContain(`"'=1+1"`);
  });

  it('resultsToCsv lists order, winner and local time', () => {
    const t = new Date(2026, 8, 29, 9, 5, 3).getTime();
    expect(resultsToCsv([{ name: '王小明', time: t }, { name: 'B', time: t }])).toBe(
      `${BOM}順序,得獎者,時間\r\n1,王小明,2026-09-29 09:05:03\r\n2,B,2026-09-29 09:05:03\r\n`,
    );
  });

  it('formatDateTime pads fields', () => {
    expect(formatDateTime(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe('2026-01-02 03:04:05');
  });

  it('csvFileName stamps the date', () => {
    expect(csvFileName('名單', new Date(2026, 8, 29, 14, 7).getTime())).toBe('spin-名單-20260929-1407.csv');
  });
});

describe('decodeCsvBytes', () => {
  it('decodes UTF-8 and strips the BOM', () => {
    const bytes = new TextEncoder().encode(`${BOM}姓名\n王小明`);
    expect(decodeCsvBytes(bytes)).toBe('姓名\n王小明');
  });

  it('falls back to Big5 for legacy Excel files', () => {
    // "中文" in Big5
    expect(decodeCsvBytes(new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5]))).toBe('中文');
  });
});
