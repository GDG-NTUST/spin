import { prefersReducedMotion } from './motion';

/**
 * Party atmosphere behind the page: colour glows, two sweeping spotlights,
 * floating shapes (circles, rounded squares, ribbon bits) on three depth
 * layers, and twinkling sparkles.
 *
 * All motion is CSS (compositor-only transforms/opacity); JS only places the
 * elements once and nudges the three layers on scroll for parallax.
 */

type Tier = 'low' | 'mid' | 'high';

const COLORS = ['var(--blue)', 'var(--red)', 'var(--yellow)', 'var(--green)'];
/** Parallax factor per layer (px of layer movement per px scrolled), far → near. */
const DEPTH = [0.03, 0.07, 0.13];
/** Max parallax shift so layers never drift far from their place. */
const MAX_SHIFT = 140;

const COUNTS: Record<Tier, { shapes: number; sparkles: number }> = {
  low: { shapes: 9, sparkles: 10 },
  mid: { shapes: 15, sparkles: 22 },
  high: { shapes: 22, sparkles: 36 },
};

/** Rough device capability → how much decoration to render. */
export function deviceTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 500;
  if (nav.connection?.saveData || cores <= 2 || mem <= 2) return 'low';
  if (coarse || small || cores <= 4) return 'mid';
  return 'high';
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

function makeShape(layer: number): HTMLElement {
  const el = document.createElement('span');
  const kind = pick(['circle', 'ring', 'square', 'ribbon', 'ribbon'] as const);
  el.className = `bg-shape bg-${kind}`;
  // Nearer layers: bigger, more opaque.
  const size = [rand(10, 18), rand(16, 28), rand(24, 44)][layer];
  el.style.cssText = [
    `--c: ${pick(COLORS)}`,
    `--s: ${size.toFixed(0)}px`,
    `left: ${rand(-3, 97).toFixed(1)}%`,
    `top: ${rand(-3, 97).toFixed(1)}%`,
    `--o: ${[0.35, 0.5, 0.7][layer]}`,
    `--r0: ${rand(0, 360).toFixed(0)}deg`,
    `--r1: ${rand(-200, 200).toFixed(0)}deg`,
    `--dx: ${rand(-60, 60).toFixed(0)}px`,
    `--dy: ${rand(-80, 80).toFixed(0)}px`,
    `animation-duration: ${rand(22, 46).toFixed(1)}s`,
    `animation-delay: -${rand(0, 40).toFixed(1)}s`,
  ].join(';');
  return el;
}

function makeSparkle(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'bg-sparkle';
  el.style.cssText = [
    `left: ${rand(0, 100).toFixed(1)}%`,
    `top: ${rand(0, 100).toFixed(1)}%`,
    `--s: ${rand(3, 7).toFixed(1)}px`,
    `--c: ${Math.random() < 0.6 ? '#fff' : pick(COLORS)}`,
    `animation-duration: ${rand(2.4, 5.5).toFixed(2)}s`,
    `animation-delay: -${rand(0, 5).toFixed(2)}s`,
  ].join(';');
  return el;
}

export function initBackground(host: HTMLElement): void {
  const tier = deviceTier();
  host.dataset.tier = tier;
  const { shapes, sparkles } = COUNTS[tier];

  const beams = document.createElement('div');
  beams.className = 'bg-beams';
  beams.innerHTML = '<span class="bg-beam bg-beam-l"></span><span class="bg-beam bg-beam-r"></span>';

  const layers = DEPTH.map((_, i) => {
    const layer = document.createElement('div');
    layer.className = `bg-layer bg-layer-${i}`;
    return layer;
  });
  // Distribute shapes: more in the far layers, fewer big ones up front.
  for (let i = 0; i < shapes; i++) {
    const layer = i % 6 < 3 ? 0 : i % 6 < 5 ? 1 : 2;
    layers[layer].append(makeShape(layer));
  }
  for (let i = 0; i < sparkles; i++) layers[i % 2].append(makeSparkle());
  host.append(beams, ...layers);

  // Scroll parallax (rAF-throttled, transform only).
  let ticking = false;
  const apply = () => {
    ticking = false;
    const y = prefersReducedMotion() ? 0 : scrollY;
    layers.forEach((l, i) => {
      const shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, y * DEPTH[i]));
      l.style.transform = `translate3d(0, ${(-shift).toFixed(1)}px, 0)`;
    });
  };
  addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    },
    { passive: true },
  );
  apply();
}

/** Fade + rise sections as they enter the viewport. */
export function initScrollReveal(selector: string): void {
  const els = [...document.querySelectorAll<HTMLElement>(selector)];
  if (!('IntersectionObserver' in window)) return;
  els.forEach((el) => el.classList.add('scroll-reveal'));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  els.forEach((el, i) => {
    el.style.setProperty('--reveal-delay', `${(i % 3) * 70}ms`);
    io.observe(el);
  });
}
