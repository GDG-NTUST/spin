import { EASE_IN, EASE_SPRING, prefersReducedMotion } from '../fx/motion';

export type ToastType = 'info' | 'success' | 'error';

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
  action?: { label: string; run: () => void };
}

let region: HTMLElement | null = null;

function getRegion(): HTMLElement {
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  return region;
}

const ICONS: Record<ToastType, string> = {
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path class="check" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
};

export function toast(message: string, { type = 'info', duration = 3200, action }: ToastOptions = {}): void {
  const host = getRegion();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${ICONS[type]}</span><span class="toast-msg"></span>`;
  el.querySelector('.toast-msg')!.textContent = message;

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      action.run();
      dismiss();
    });
    el.append(btn);
  }

  // Keep at most 3 on screen.
  while (host.children.length >= 3) host.firstElementChild!.remove();
  host.append(el);

  const reduced = prefersReducedMotion();
  el.animate(
    reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: 'translateY(24px) scale(0.9)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
    { duration: reduced ? 150 : 420, easing: EASE_SPRING },
  );
  if (type === 'error' && !reduced) {
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
      { duration: 360, delay: 260, composite: 'add' },
    );
  }

  let gone = false;
  let timer = window.setTimeout(dismiss, action ? duration + 2500 : duration);
  // Pause while the pointer or keyboard focus is on the toast (WCAG 2.2.1).
  const pause = () => clearTimeout(timer);
  const resume = () => {
    clearTimeout(timer);
    if (!el.matches(':hover, :focus-within')) timer = window.setTimeout(dismiss, 1500);
  };
  el.addEventListener('pointerenter', pause);
  el.addEventListener('focusin', pause);
  el.addEventListener('pointerleave', resume);
  el.addEventListener('focusout', resume);
  function dismiss() {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    const out = el.animate(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: reduced ? 'none' : 'translateY(12px) scale(0.96)' },
      ],
      { duration: 220, easing: EASE_IN, fill: 'forwards' },
    );
    out.onfinish = () => el.remove();
  }
}
