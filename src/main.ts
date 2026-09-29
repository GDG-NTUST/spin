import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/entries.css';
import './styles/wheel.css';
import './styles/reveal.css';
import { sfx, unlockAudioOnGesture } from './audio/sfx';
import { loadState, persist } from './state/persist';
import { createStore } from './state/store';
import { DrawFlow } from './ui/drawFlow';
import { initEntryPanel } from './ui/entryPanel';
import { initHistoryPanel } from './ui/historyPanel';
import { initSettingsControls } from './ui/settingsControls';
import { initThemeToggle } from './ui/themeToggle';
import { initWheel } from './wheel';

const store = createStore(loadState());
persist(store);

initThemeToggle(document.querySelector<HTMLButtonElement>('#theme-toggle')!);
initEntryPanel(store);
initHistoryPanel(store);
initSettingsControls(store);
unlockAudioOnGesture();

const announcer = document.querySelector<HTMLElement>('#announcer')!;
const flow = new DrawFlow(store, announcer);
const wheel = initWheel(store, flow.events());
flow.attach(wheel);

if (import.meta.env.DEV) Object.assign(window, { __spin: { store, wheel, sfx, flow } });
