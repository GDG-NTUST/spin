import { sfx } from '../audio/sfx';
import { pop } from '../fx/motion';
import { updateSettings, type AppState, type Store } from '../state/store';

const SOUND_ON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const SOUND_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

/** Header mute button + near-miss slider. */
export function initSettingsControls(store: Store): void {
  const mute = document.querySelector<HTMLButtonElement>('#mute-toggle')!;
  const range = document.querySelector<HTMLInputElement>('#opt-near-miss')!;
  const output = document.querySelector<HTMLOutputElement>('#near-miss-value')!;

  mute.addEventListener('click', () => {
    const muted = !store.get().settings.muted;
    updateSettings(store, { muted });
    if (!muted) {
      sfx.unlock();
      sfx.tick(600);
    }
  });

  range.addEventListener('input', () => {
    updateSettings(store, { nearMissRate: Number(range.value) / 100 });
    pop(output, 1.15);
  });

  const render = (s: AppState, prev?: AppState) => {
    if (s.settings === prev?.settings) return;
    const { muted, nearMissRate } = s.settings;
    sfx.muted = muted;
    if (muted !== prev?.settings.muted) {
      mute.innerHTML = `<span class="icon-swap">${muted ? SOUND_OFF : SOUND_ON}</span>`;
      mute.setAttribute('aria-label', muted ? '音效：關閉' : '音效：開啟');
      mute.setAttribute('aria-pressed', String(muted));
      mute.title = muted ? '開啟音效' : '靜音';
    }
    const pct = Math.round(nearMissRate * 100);
    if (Number(range.value) !== pct) range.value = String(pct);
    range.style.setProperty('--fill', `${pct}%`);
    output.textContent = pct === 0 ? '關閉' : `${pct}%`;
  };
  render(store.get());
  store.subscribe(render);
}
