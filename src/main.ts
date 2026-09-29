import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/entries.css';
import './styles/wheel.css';
import { sfx, unlockAudioOnGesture } from './audio/sfx';
import { loadState, persist } from './state/persist';
import { createStore, newId } from './state/store';
import { initEntryPanel } from './ui/entryPanel';
import { initHistoryPanel } from './ui/historyPanel';
import { initSettingsControls } from './ui/settingsControls';
import { initThemeToggle } from './ui/themeToggle';
import { toast } from './ui/toast';
import { initWheel } from './wheel';

const store = createStore(loadState());
persist(store);

initThemeToggle(document.querySelector<HTMLButtonElement>('#theme-toggle')!);
initEntryPanel(store);
initHistoryPanel(store);
initSettingsControls(store);
unlockAudioOnGesture();

const announcer = document.querySelector<HTMLElement>('#announcer')!;

// Interim result handling — replaced by the full reveal card in stage 5.
const wheel = initWheel(store, {
  onResult(winner) {
    announcer.textContent = `得獎者：${winner.name}`;
    toast(`得獎者：${winner.name}`, { type: 'success', duration: 4000 });
    store.set((s) => ({ ...s, history: [...s.history, { id: newId(), name: winner.name, time: Date.now() }] }));
    if (store.get().settings.removeWinner) {
      setTimeout(() => store.set((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== winner.id) })), 1200);
    }
  },
});

if (import.meta.env.DEV) Object.assign(window, { __spin: { store, wheel, sfx } });
