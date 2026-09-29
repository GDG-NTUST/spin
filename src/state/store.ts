export interface Entry {
  id: string;
  name: string;
}

export interface Winner {
  id: string;
  name: string;
  /** Epoch milliseconds. */
  time: number;
}

export type ImportMode = 'append' | 'replace';

export interface Settings {
  dedupe: boolean;
  removeWinner: boolean;
  importMode: ImportMode;
  muted: boolean;
  /** Probability (0–1) of a near-miss stop. */
  nearMissRate: number;
  fastMode: boolean;
}

export interface AppState {
  entries: Entry[];
  /** Oldest first. */
  history: Winner[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  dedupe: true,
  removeWinner: true,
  importMode: 'append',
  muted: false,
  nearMissRate: 0.25,
  fastMode: false,
};

type Listener = (state: AppState, prev: AppState) => void;

export interface Store {
  get(): AppState;
  set(update: (state: AppState) => AppState): void;
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(update) {
      const prev = state;
      state = update(state);
      if (state !== prev) listeners.forEach((l) => l(state, prev));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let counter = 0;
export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

export const toEntries = (names: readonly string[]): Entry[] => names.map((name) => ({ id: newId(), name }));

export function updateSettings(store: Store, patch: Partial<Settings>): void {
  store.set((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}
