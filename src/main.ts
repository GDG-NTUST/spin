import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/entries.css';
import { loadState, persist } from './state/persist';
import { createStore } from './state/store';
import { initEntryPanel } from './ui/entryPanel';
import { initHistoryPanel } from './ui/historyPanel';
import { initThemeToggle } from './ui/themeToggle';

const store = createStore(loadState());
persist(store);

initThemeToggle(document.querySelector<HTMLButtonElement>('#theme-toggle')!);
initEntryPanel(store);
initHistoryPanel(store);
