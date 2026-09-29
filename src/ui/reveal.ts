import confetti from 'canvas-confetti';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '../fx/motion';

export type RevealAction = 'again' | 'remove' | 'keep' | 'close';

const COLORS = ['#4285F4', '#EA4335', '#FBBC04', '#34A853'];

export interface RevealOptions {
  name: string;
  /** 1-based draw number, shown as 第 N 位. */
  order: number;
  /** When the pool auto-removes winners, the secondary button offers "keep" instead of "remove". */
  autoRemove: boolean;
}

/**
 * Modal winner card: flash, four-colour confetti, name pops in letter by letter.
 * `open` resolves with the button the user chose.
 */
export class RevealCard {
  private readonly root: HTMLDivElement;
  private readonly card: HTMLElement;
  private readonly fire: confetti.CreateTypes;
  private resolve: ((a: RevealAction) => void) | null = null;
  private returnFocus: HTMLElement | null = null;
  private tl: gsap.core.Timeline | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'reveal';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'reveal-title');
    this.root.innerHTML = `
      <div class="reveal-backdrop" data-action="close"></div>
      <canvas class="reveal-confetti" aria-hidden="true"></canvas>
      <div class="reveal-flash" aria-hidden="true"></div>
      <div class="reveal-card">
        <div class="reveal-ribbon" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <p class="reveal-kicker" id="reveal-title"></p>
        <div class="reveal-body"></div>
        <p class="reveal-note"></p>
        <div class="reveal-actions"></div>
      </div>`;
    document.body.append(this.root);
    this.card = this.root.querySelector('.reveal-card')!;
    this.fire = confetti.create(this.root.querySelector<HTMLCanvasElement>('.reveal-confetti')!, {
      resize: true,
      useWorker: true,
      disableForReducedMotion: true,
    });

    this.root.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) this.close(action as RevealAction);
    });
    this.root.addEventListener('keydown', (e) => this.onKey(e));
  }

  get isOpen(): boolean {
    return this.resolve !== null;
  }

  open({ name, order, autoRemove }: RevealOptions): Promise<RevealAction> {
    this.render(
      '恭喜得獎',
      `<h2 class="reveal-name" aria-label="${escapeHtml(name)}">${splitChars(name)}</h2>
       <p class="reveal-meta">第 ${order} 位得獎者</p>`,
      autoRemove ? '關閉後會自動從獎池移除' : '',
      [
        ['again', '再抽一次', 'btn-primary'],
        autoRemove ? ['keep', '保留在獎池', 'btn-ghost'] : ['remove', '從獎池移除', 'btn-ghost'],
        ['close', '關閉', 'btn-ghost'],
      ],
    );
    return this.show(true);
  }

  /** Summary after "batch draw N". */
  openBatch(names: readonly string[], startOrder: number): Promise<RevealAction> {
    const items = names
      .map((n, i) => `<li class="batch-item"><span class="batch-order">#${startOrder + i}</span><span class="batch-name">${escapeHtml(n)}</span></li>`)
      .join('');
    this.render('批次抽獎結果', `<p class="reveal-meta">共 ${names.length} 位得獎者</p><ol class="batch-list">${items}</ol>`, '', [
      ['close', '完成', 'btn-primary'],
    ]);
    return this.show(false);
  }

  close(action: RevealAction = 'close'): void {
    if (!this.resolve) return;
    const resolve = this.resolve;
    this.resolve = null;
    this.tl?.kill();
    const reduced = prefersReducedMotion();
    gsap
      .timeline({
        onComplete: () => {
          this.root.hidden = true;
          this.fire.reset();
        },
      })
      .to(this.card, reduced ? { opacity: 0, duration: 0.15 } : { opacity: 0, scale: 0.92, y: 16, duration: 0.2, ease: 'power2.in' })
      .to(this.root.querySelector('.reveal-backdrop'), { opacity: 0, duration: 0.2 }, 0);
    this.returnFocus?.focus({ preventScroll: true });
    resolve(action);
  }

  /** Small celebratory burst from a point on screen (used between batch spins). */
  burst(x: number, y: number): void {
    confetti({
      particleCount: 40,
      spread: 70,
      startVelocity: 32,
      scalar: 0.8,
      ticks: 120,
      colors: COLORS,
      origin: { x: x / innerWidth, y: y / innerHeight },
      disableForReducedMotion: true,
    });
  }

  // ── internals ──────────────────────────────────────────────

  private render(kicker: string, body: string, note: string, actions: [RevealAction, string, string][]): void {
    this.root.querySelector('.reveal-kicker')!.textContent = kicker;
    this.root.querySelector('.reveal-body')!.innerHTML = body;
    const noteEl = this.root.querySelector<HTMLElement>('.reveal-note')!;
    noteEl.textContent = note;
    noteEl.hidden = !note;
    this.root.querySelector('.reveal-actions')!.innerHTML = actions
      .map(([a, label, cls]) => `<button type="button" class="btn ${cls}" data-action="${a}">${label}</button>`)
      .join('');
  }

  private show(celebrate: boolean): Promise<RevealAction> {
    if (this.resolve) this.close();
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.root.hidden = false;
    const reduced = prefersReducedMotion();
    const q = <T extends Element>(sel: string) => this.root.querySelectorAll<T>(sel);
    const backdrop = this.root.querySelector('.reveal-backdrop');
    const flash = this.root.querySelector('.reveal-flash');

    this.tl?.kill();
    gsap.set(this.card, { clearProps: 'all' });
    if (reduced) {
      this.tl = gsap
        .timeline()
        .fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2 })
        .fromTo(this.card, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0);
    } else {
      const tl = gsap
        .timeline()
        .fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' })
        .fromTo(flash, { opacity: celebrate ? 0.85 : 0 }, { opacity: 0, duration: 0.6, ease: 'power2.out' }, 0)
        .fromTo(this.card, { opacity: 0, scale: 0.55, y: 40, rotation: -4 }, { opacity: 1, scale: 1, y: 0, rotation: 0, duration: 0.6, ease: 'back.out(1.9)' }, 0.02);
      // Only animate parts present in this variant (single card vs batch summary).
      const add = (sel: string, from: gsap.TweenVars, to: gsap.TweenVars, at: number) => {
        const els = q(sel);
        if (els.length) tl.fromTo(els, from, to, at);
      };
      add('.reveal-ribbon span', { scaleX: 0 }, { scaleX: 1, duration: 0.35, stagger: 0.06, ease: 'power3.out' }, 0.15);
      add('.reveal-name .ch', { opacity: 0, y: 28, scale: 0.5 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.045, ease: 'back.out(2.4)' }, 0.18);
      add('.batch-item', { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' }, 0.2);
      add('.reveal-meta, .reveal-note:not([hidden]), .reveal-actions .btn', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' }, 0.3);
      this.tl = tl;
      if (celebrate) this.celebrate();
    }

    q<HTMLButtonElement>('.reveal-actions .btn')[0]?.focus({ preventScroll: true });
    return new Promise((resolve) => (this.resolve = resolve));
  }

  private celebrate(): void {
    const common = { colors: COLORS, ticks: 260, gravity: 0.9, scalar: 1.05 };
    this.fire({ ...common, particleCount: 90, angle: 60, spread: 60, startVelocity: 55, origin: { x: 0, y: 0.75 } });
    this.fire({ ...common, particleCount: 90, angle: 120, spread: 60, startVelocity: 55, origin: { x: 1, y: 0.75 } });
    setTimeout(() => this.fire({ ...common, particleCount: 120, spread: 110, startVelocity: 38, origin: { x: 0.5, y: 0.38 }, shapes: ['square', 'circle'] }), 160);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close('close');
      return;
    }
    if (e.key !== 'Tab') return;
    // Keep focus inside the dialog.
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('.reveal-actions .btn')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Wrap each character for the letter-by-letter entrance. */
function splitChars(s: string): string {
  return [...s].map((ch) => (ch === ' ' ? ' ' : `<span class="ch" aria-hidden="true">${escapeHtml(ch)}</span>`)).join('');
}
