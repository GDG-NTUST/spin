import { gsap } from 'gsap';

export const INTRO_KEY = 'spin:intro-played';
const COLORS = ['var(--blue)', 'var(--red)', 'var(--yellow)', 'var(--green)'];

/** Mirrors the inline <head> check that adds `intro-pending` before first paint. */
export function introPending(): boolean {
  return document.documentElement.classList.contains('intro-pending');
}

/** Wrap each title character for the letter-by-letter entrance. */
export function splitTitle(el: HTMLElement): HTMLElement[] {
  const text = el.textContent ?? '';
  el.setAttribute('aria-label', text);
  el.innerHTML = [...text].map((ch) => `<span class="title-ch" aria-hidden="true">${ch}</span>`).join('');
  return [...el.querySelectorAll<HTMLElement>('.title-ch')];
}

/**
 * ~1.3 s opening: four brand dots spiral in to the wheel's centre, pulse, and
 * burst open into a four-colour disc the size of the wheel, which hands off to
 * the real canvas. Title letters rise in meanwhile. Click / key / tap skips.
 */
export function playIntro(opts: { stage: HTMLElement; wheelRadius: number; title: HTMLElement }): Promise<void> {
  const root = document.documentElement;
  try {
    sessionStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* ignore */
  }

  const rect = opts.stage.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const R = Math.max(40, opts.wheelRadius);

  const overlay = document.createElement('div');
  overlay.className = 'intro';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="intro-center" style="left:${cx}px;top:${cy}px">
      <div class="intro-disc"></div>
      <div class="intro-dots">${COLORS.map((c) => `<span class="intro-dot" style="--c:${c}"></span>`).join('')}</div>
    </div>
    <p class="intro-skip">點選任意處略過</p>`;
  document.body.append(overlay);

  const chars = splitTitle(opts.title);
  const dots = [...overlay.querySelectorAll<HTMLElement>('.intro-dot')];
  const disc = overlay.querySelector<HTMLElement>('.intro-disc')!;
  const dotBox = overlay.querySelector<HTMLElement>('.intro-dots')!;
  const spread = Math.min(innerWidth, innerHeight) * 0.42;

  return new Promise<void>((resolve) => {
    const finish = () => {
      overlay.remove();
      root.classList.remove('intro-pending');
      gsap.set([opts.stage, ...chars, '.site-header .brand', '.header-actions'], { clearProps: 'all' });
      removeEventListener('keydown', skip, true);
      removeEventListener('pointerdown', skip, true);
      resolve();
    };
    const tl = gsap.timeline({ onComplete: finish });
    function skip() {
      tl.progress(1);
    }
    addEventListener('pointerdown', skip, true);
    addEventListener('keydown', skip, true);

    // Page parts start hidden; the handoff reveals them.
    gsap.set(opts.stage, { opacity: 0, scale: 0.92 });
    gsap.set(chars, { opacity: 0, y: 22 });
    gsap.set(['.site-header .brand', '.header-actions'], { opacity: 0 });
    root.classList.add('intro-running');

    // 1. Dots pop in at four compass points, then spiral inwards.
    dots.forEach((d, i) => {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 4;
      gsap.set(d, { x: Math.cos(a) * spread, y: Math.sin(a) * spread, scale: 0 });
    });
    tl.to(dots, { scale: 1, duration: 0.18, stagger: 0.04, ease: 'back.out(3)' }, 0)
      .to(dotBox, { rotation: 300, duration: 0.55, ease: 'power2.in' }, 0.12)
      .to(dots, { x: 0, y: 0, duration: 0.55, ease: 'power3.in' }, 0.12)
      // 2. Cluster squeeze & pop.
      .to(dots, { scale: 1.6, duration: 0.08, ease: 'power1.out' }, 0.66)
      // 3. Burst into a wheel-sized disc.
      .fromTo(disc, { width: 28, height: 28, rotation: -200, opacity: 1 }, { width: R * 2, height: R * 2, rotation: 0, duration: 0.42, ease: 'back.out(1.5)', immediateRender: false }, 0.72)
      .to(dots, { opacity: 0, scale: 0.4, duration: 0.15 }, 0.74)
      // Title letters rise throughout.
      .to(chars, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: 'back.out(2)' }, 0.25)
      // 4. Hand off to the real wheel and page.
      .add(() => root.classList.remove('intro-pending'), 1.0)
      .to(overlay, { backgroundColor: 'rgba(0,0,0,0)', duration: 0.35, ease: 'power1.out' }, 1.0)
      .to(opts.stage, { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' }, 1.0)
      .to(disc, { opacity: 0, duration: 0.3 }, 1.05)
      .to(['.site-header .brand', '.header-actions'], { opacity: 1, duration: 0.3, stagger: 0.06 }, 1.0)
      .to(overlay.querySelector('.intro-skip'), { opacity: 0, duration: 0.2 }, 1.0);
  }).then(() => root.classList.remove('intro-running'));
}
