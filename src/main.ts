import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/entries.css';
import './styles/wheel.css';
import './styles/reveal.css';
import './styles/background.css';
import './styles/polish.css';
import { sfx, unlockAudioOnGesture } from './audio/sfx';
import { initBackground, initScrollReveal } from './fx/background';
import { introPending, playIntro } from './fx/intro';
import { loadState, persist } from './state/persist';
import { createStore } from './state/store';
import { DrawFlow } from './ui/drawFlow';
import { initEntryPanel } from './ui/entryPanel';
import { initHistoryPanel } from './ui/historyPanel';
import { initSettingsControls } from './ui/settingsControls';
import { initThemeToggle } from './ui/themeToggle';
import { initWheel } from './wheel';

// Switch thumbs only bounce after the user toggles them, not on first render.
document.querySelectorAll<HTMLElement>('.switch').forEach((l) => {
  l.classList.add('no-anim');
  l.addEventListener('change', () => l.classList.remove('no-anim'), { once: true });
});

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

// Atmosphere, intro and scroll reveal.
initBackground(document.querySelector<HTMLElement>('.bg')!);
const revealTargets = '.panel:not(.panel-wheel), .site-footer';
const startReveal = () => {
  initScrollReveal(revealTargets);
  document.documentElement.classList.remove('reveal-pending');
  focusEntryInput();
};

/**
 * Ready to paste a list straight away. Skipped on touch screens (it would pop
 * the keyboard over the wheel) and if the user already focused something.
 */
function focusEntryInput(): void {
  if (!matchMedia('(pointer: fine)').matches) return;
  if (document.activeElement && document.activeElement !== document.body) return;
  document.querySelector<HTMLTextAreaElement>('#entry-input')?.focus({ preventScroll: true });
}
if (introPending()) {
  void playIntro({
    stage: document.querySelector<HTMLElement>('#wheel-stage')!,
    wheelRadius: wheel.renderer.radius,
    title: document.querySelector<HTMLElement>('.site-title')!,
  }).then(startReveal);
} else {
  startReveal();
}

if (import.meta.env.DEV) Object.assign(window, { __spin: { store, wheel, sfx, flow } });
