/** Newline, `,` `，` `、` `|` Tab `;` `；` — any mix, any run length. */
export const SEPARATORS = /[\r\n,，、|\t;；]+/;

export interface ParseOptions {
  /** Drop repeated names (compared with {@link nameKey}). Default: true. */
  dedupe?: boolean;
}

/**
 * Comparison key for duplicate detection: Unicode-compatibility normalised
 * (full-width ↔ half-width), case-insensitive, internal whitespace collapsed.
 * The displayed name itself is never altered.
 */
export function nameKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Split a pasted list into names. Trims each item and skips empty ones. */
export function parseEntries(input: string, { dedupe = true }: ParseOptions = {}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.split(SEPARATORS)) {
    const name = raw.trim();
    if (!name) continue;
    if (dedupe) {
      const key = nameKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(name);
  }
  return out;
}

/**
 * Decide which incoming names get added to an existing pool.
 * With `dedupe`, names already in the pool (or repeated within `incoming`) are skipped.
 */
export function mergeNames(
  existing: readonly string[],
  incoming: readonly string[],
  dedupe: boolean,
): { added: string[]; skipped: number } {
  if (!dedupe) return { added: [...incoming], skipped: 0 };
  const seen = new Set(existing.map(nameKey));
  const added: string[] = [];
  for (const name of incoming) {
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(name);
  }
  return { added, skipped: incoming.length - added.length };
}

/** Indices of entries that repeat an earlier entry (first occurrence is kept). */
export function duplicateIndices(names: readonly string[]): number[] {
  const seen = new Set<string>();
  const dupes: number[] = [];
  names.forEach((name, i) => {
    const key = nameKey(name);
    if (seen.has(key)) dupes.push(i);
    else seen.add(key);
  });
  return dupes;
}
