const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export const prefersReducedMotion = (): boolean => reducedQuery?.matches ?? false;

export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
export const EASE_IN = 'cubic-bezier(0.55, 0, 1, 0.45)';

/** Horizontal error shake. */
export function shake(el: Element): Animation | undefined {
  if (prefersReducedMotion()) return undefined;
  return el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-7px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(2px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 380, easing: 'ease-out' },
  );
}

/** Quick scale "bump" for value changes / confirmations. */
export function pop(el: Element, scale = 1.12): Animation | undefined {
  if (prefersReducedMotion()) return undefined;
  return el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }], {
    duration: 320,
    easing: EASE_SPRING,
  });
}

/** Retrigger a CSS keyframe class (e.g. flash-success). */
export function flashClass(el: Element, cls: string, ms = 700): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}
