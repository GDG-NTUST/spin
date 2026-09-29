import Papa from 'papaparse';

export const BOM = '﻿';

/** Header cells that mark a name column, highest priority first. */
const PRIMARY_HEADERS = ['name', '姓名'];
const OTHER_HEADERS = [
  'names', 'full name', 'fullname', 'display name', 'participant', 'participants',
  '名字', '名稱', '名單', '參加者', '參與者', '報名者', '得獎者', '暱稱',
];
/** Header cells that are clearly not names but still indicate a header row. */
const NON_NAME_HEADERS = [
  'id', 'no', 'no.', '#', '序號', '編號', '順序', 'email', 'e-mail', '信箱', '電子郵件',
  'phone', '電話', '手機', '學號', '系所', '科系', 'department', 'time', '時間', 'timestamp',
];

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();

/** Decode file bytes: UTF-8 (with or without BOM), falling back to Big5 for legacy Excel exports. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('big5').decode(bytes);
  }
}

export interface CsvNames {
  names: string[];
  hasHeader: boolean;
  /** Zero-based column the names were read from; -1 when every cell of a single row was used. */
  column: number;
}

/** Undo the `'` prefix added by formula escaping on export. */
function unescapeFormula(cell: string): string {
  return /^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell;
}

/**
 * Read names out of CSV text.
 * - Header row is detected when the first row contains a known column title.
 * - A `name` / `姓名` column wins, then other name-like titles, else the first column.
 * - A single header-less row with several cells (`a,b,c`) is treated as a list of names.
 */
export function extractNamesFromCsv(text: string): CsvNames {
  const { data } = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const rows = data.filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length === 0) return { names: [], hasHeader: false, column: 0 };

  const first = rows[0].map(norm);
  const findCol = (keys: string[]) => first.findIndex((c) => keys.includes(c));

  let column = findCol(PRIMARY_HEADERS);
  if (column < 0) column = findCol(OTHER_HEADERS);
  const hasHeader = column >= 0 || findCol(NON_NAME_HEADERS) >= 0;
  if (column < 0) column = 0;

  const clean = (cells: (string | undefined)[]) =>
    cells.map((c) => unescapeFormula((c ?? '').trim())).filter((c) => c !== '');

  if (!hasHeader && rows.length === 1 && rows[0].length > 1) {
    return { names: clean(rows[0]), hasHeader: false, column: -1 };
  }

  const body = hasHeader ? rows.slice(1) : rows;
  return { names: clean(body.map((r) => r[column])), hasHeader, column };
}

function toCsv(rows: (string | number)[][]): string {
  return BOM + Papa.unparse(rows, { newline: '\r\n', escapeFormulae: true }) + '\r\n';
}

/** Pool export: one `姓名` column, UTF-8 BOM for Excel. */
export function namesToCsv(names: readonly string[]): string {
  return toCsv([['姓名'], ...names.map((n) => [n])]);
}

export interface ResultRow {
  name: string;
  /** Epoch milliseconds. */
  time: number;
}

/** `YYYY-MM-DD HH:mm:ss` in local time. */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Draw-history export: 順序, 得獎者, 時間 — rows in draw order (oldest first). */
export function resultsToCsv(results: readonly ResultRow[]): string {
  return toCsv([['順序', '得獎者', '時間'], ...results.map((r, i) => [i + 1, r.name, formatDateTime(r.time)])]);
}

/** `spin-<label>-YYYYMMDD-HHmm.csv` */
export function csvFileName(label: string, now = Date.now()): string {
  const stamp = formatDateTime(now).replace(/[-:]/g, '').replace(' ', '-').slice(0, 13);
  return `spin-${label}-${stamp}.csv`;
}
