export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = 'spin:theme';
const ORDER: ThemePref[] = ['auto', 'light', 'dark'];

const LABEL: Record<ThemePref, string> = {
  auto: '深淺色：跟隨系統',
  light: '深淺色：淺色',
  dark: '深淺色：深色',
};

const ICON: Record<ThemePref, string> = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  light:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
};

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage unavailable */
  }
  return 'auto';
}

function applyPref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'auto') delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable */
  }
}

export function initThemeToggle(button: HTMLButtonElement): void {
  let pref = readPref();

  const render = () => {
    button.innerHTML = `<span class="icon-swap">${ICON[pref]}</span>`;
    button.setAttribute('aria-label', LABEL[pref]);
    button.title = LABEL[pref];
  };

  button.addEventListener('click', () => {
    pref = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    applyPref(pref);
    render();
  });

  render();
}
