import { DEFAULT_SETTINGS, newId, type AppState, type Entry, type Store, type Winner } from './store';

const KEY = 'spin:state:v1';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function readEntries(v: unknown): Entry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e) => isObj(e) && typeof e.name === 'string' && e.name.trim() !== '')
    .map((e) => ({ id: typeof e.id === 'string' ? e.id : newId(), name: e.name as string }));
}

function readHistory(v: unknown): Winner[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((w) => isObj(w) && typeof w.name === 'string' && typeof w.time === 'number')
    .map((w) => ({ id: typeof w.id === 'string' ? w.id : newId(), name: w.name as string, time: w.time as number }));
}

/** Load saved state; anything missing or malformed falls back to defaults. */
export function loadState(): AppState {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    /* unavailable or corrupt */
  }
  const saved = isObj(raw) ? raw : {};
  const s = isObj(saved.settings) ? saved.settings : {};
  const settings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof typeof settings)[]) {
    if (typeof s[k] === typeof DEFAULT_SETTINGS[k]) (settings as Record<string, unknown>)[k] = s[k];
  }
  if (settings.importMode !== 'append' && settings.importMode !== 'replace') settings.importMode = 'append';
  settings.nearMissRate = Math.min(1, Math.max(0, settings.nearMissRate));
  return { entries: readEntries(saved.entries), history: readHistory(saved.history), settings };
}

/** Save on every change, coalesced to one write per frame burst. */
export function persist(store: Store): void {
  let timer = 0;
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store.get()));
    } catch {
      /* quota or private mode — keep working in memory */
    }
  };
  store.subscribe(() => {
    clearTimeout(timer);
    timer = window.setTimeout(save, 150);
  });
  window.addEventListener('pagehide', save);
}
