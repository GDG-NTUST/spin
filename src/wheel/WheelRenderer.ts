import { prefersReducedMotion } from '../fx/motion';
import { mod } from '../lib/spinMath';
import type { Entry } from '../state/store';
import { EASE_OUT_FN } from './easing';
import { LABEL_COLORS, PALETTE, assignColors, type RGB } from './colors';

interface Slice {
  id: string;
  name: string;
  /** Current weight (animated); slice angle ∝ weight. */
  w: number;
  w0: number;
  w1: number;
  color: number;
  rgb: RGB;
  rgb0: RGB;
}

/** Below this label size (CSS px) names are hidden and only colours remain. */
const MIN_FONT = 10;
const TRANSITION_MS = 480;
/** Canvas resolution cap: phones get 2× (plenty sharp, much cheaper to blit). */
const MAX_DPR = matchMedia('(pointer: coarse)').matches ? 2 : 2.5;

const DEG = Math.PI / 180;
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: RGB, alpha = 1) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;

export interface WheelTheme {
  rim: string;
  rimShine: string;
  peg: string;
  empty: string;
  emptyText: string;
  font: string;
}

function readTheme(el: Element): WheelTheme {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    rim: v('--wheel-rim', '#1f2330'),
    rimShine: v('--wheel-rim-shine', 'rgba(255,255,255,.18)'),
    peg: v('--wheel-peg', '#ffffff'),
    empty: v('--wheel-empty', 'rgba(127,127,127,.15)'),
    emptyText: v('--text-muted', '#888'),
    font: s.fontFamily || 'system-ui, sans-serif',
  };
}

/**
 * Canvas 2D wheel. Slices are painted once into an off-screen bitmap which is
 * then rotated per frame, so spinning costs one drawImage regardless of names.
 */
export class WheelRenderer {
  rotation = 0;
  /**
   * Motion-blur samples: earlier rotations (oldest first). When non-empty the
   * wheel is drawn as the average of these plus the current rotation.
   */
  trail: number[] = [];

  private readonly ctx: CanvasRenderingContext2D;
  private readonly off = document.createElement('canvas');
  private readonly offCtx: CanvasRenderingContext2D;
  private slices: Slice[] = [];
  private pending: readonly Entry[] | null = null;
  private locked = false;
  private transitionStart = 0;
  private transitioning = false;
  private offDirty = true;
  private raf = 0;
  private size = 0; // CSS px
  private dpr = 1;
  private theme: WheelTheme;
  private lastPointerId: string | null | undefined;
  private labels = true;
  private hl: { id: string; start: number; out: boolean } | null = null;

  onPointerChange: (slice: { id: string; name: string } | null) => void = () => {};
  onLabelsChange: (visible: boolean) => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.offCtx = this.off.getContext('2d')!;
    this.theme = readTheme(canvas);

    new ResizeObserver(() => this.resize()).observe(canvas);
    const retheme = () => {
      this.theme = readTheme(canvas);
      this.offDirty = true;
      this.requestDraw();
    };
    new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
    // DPR changes when the window moves between screens or on zoom.
    const watchDpr = () =>
      matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => (this.resize(), watchDpr()), { once: true });
    watchDpr();
    this.resize();
  }

  /** Radius of the painted wheel in CSS px (excludes rim). */
  get radius(): number {
    return this.size / 2 - this.rimWidth - this.size * 0.035;
  }

  private get rimWidth(): number {
    return Math.max(6, this.size * 0.028);
  }

  /** Number of settled (non-leaving) slices. */
  get count(): number {
    return this.slices.filter((s) => s.w1 > 0).length;
  }

  get labelsVisible(): boolean {
    return this.labels;
  }

  // ── Entries ────────────────────────────────────────────────

  setEntries(entries: readonly Entry[], animate = true): void {
    if (this.locked) {
      this.pending = entries;
      return;
    }
    const prev = new Map(this.slices.map((s) => [s.id, s]));
    const nextIds = new Set(entries.map((e) => e.id));

    // Keep leaving slices next to the neighbour they had, so they shrink in place.
    const order: Slice[] = [];
    const leavingAfter = new Map<string | null, Slice[]>();
    let lastKept: string | null = null;
    for (const s of this.slices) {
      if (nextIds.has(s.id)) lastKept = s.id;
      else if (s.w1 > 0 || s.w > 0) {
        const list = leavingAfter.get(lastKept) ?? [];
        list.push(s);
        leavingAfter.set(lastKept, list);
      }
    }
    const pushLeaving = (key: string | null) => {
      for (const s of leavingAfter.get(key) ?? []) {
        s.w0 = s.w;
        s.w1 = 0;
        order.push(s);
      }
    };
    pushLeaving(null);
    for (const e of entries) {
      const old = prev.get(e.id);
      const s: Slice = old ?? { id: e.id, name: e.name, w: 0, w0: 0, w1: 1, color: -1, rgb: PALETTE[0], rgb0: PALETTE[0] };
      s.name = e.name;
      s.w0 = s.w;
      s.w1 = 1;
      order.push(s);
      if (old) pushLeaving(e.id);
    }

    // Colours are solved over the final ring (leaving slices excluded).
    const staying = order.filter((s) => s.w1 > 0);
    const colors = assignColors(staying.map((s) => (s.color >= 0 ? s.color : null)));
    staying.forEach((s, i) => {
      const fresh = s.color < 0;
      s.rgb0 = fresh ? PALETTE[colors[i]] : s.rgb;
      s.color = colors[i];
      if (fresh) s.rgb = s.rgb0;
    });

    this.slices = order;
    if (animate && prev.size > 0) {
      this.transitionStart = performance.now();
      this.transitioning = true;
    } else {
      this.finishTransition();
    }
    this.offDirty = true;
    this.requestDraw();
  }

  /** Freeze the slice layout while a spin is running; updates are applied on unlock. */
  lock(): void {
    this.finishTransition();
    this.locked = true;
  }

  unlock(): void {
    this.locked = false;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.setEntries(p);
    }
  }

  private finishTransition(): void {
    this.transitioning = false;
    this.slices = this.slices.filter((s) => s.w1 > 0);
    for (const s of this.slices) {
      s.w = s.w0 = s.w1;
      s.rgb = s.rgb0 = PALETTE[s.color];
    }
    this.offDirty = true;
  }

  private stepTransition(now: number): void {
    if (!this.transitioning) return;
    const t = Math.min(1, (now - this.transitionStart) / TRANSITION_MS);
    const e = EASE_OUT_FN(t);
    for (const s of this.slices) {
      s.w = lerp(s.w0, s.w1, e);
      s.rgb = mixRgb(s.rgb0, PALETTE[s.color], e);
    }
    this.offDirty = true;
    if (t >= 1) this.finishTransition();
  }

  // ── Rotation / pointer ─────────────────────────────────────

  /** `immediate` draws synchronously — use it from inside an animation frame to avoid a frame of lag. */
  setRotation(rot: number, immediate = false): void {
    this.rotation = rot;
    if (!immediate) return this.requestDraw();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.draw(performance.now());
  }

  /** Slice under the pointer, honouring animated weights. */
  sliceAt(rot = this.rotation): Slice | null {
    const total = this.slices.reduce((a, s) => a + s.w, 0);
    if (total <= 0) return null;
    const target = (mod(-rot, 360) / 360) * total;
    let acc = 0;
    for (const s of this.slices) {
      acc += s.w;
      if (target < acc) return s;
    }
    return this.slices[this.slices.length - 1];
  }

  // ── Drawing ────────────────────────────────────────────────

  requestDraw(): void {
    if (!this.raf) this.raf = requestAnimationFrame((now) => this.draw(now));
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const size = Math.round(rect.width);
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    if (size === this.size && dpr === this.dpr) return;
    this.size = size;
    this.dpr = dpr;
    this.canvas.width = this.off.width = Math.round(size * dpr);
    this.canvas.height = this.off.height = Math.round(size * dpr);
    this.canvas.style.setProperty('--wheel-radius', `${this.radius}px`);
    this.offDirty = true;
    this.draw(performance.now());
  }

  private draw(now: number): void {
    this.raf = 0;
    if (!this.size) return;
    this.stepTransition(now);
    if (this.offDirty) this.paintSlices();

    const { ctx, dpr, size } = this;
    const c = size / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Motion blur: layering copy i at alpha 1/(i+1) yields the equal-weight
    // average of all samples — a box blur along the direction of travel.
    const samples = this.trail.length ? [...this.trail, this.rotation] : [this.rotation];
    samples.forEach((rot, i) => {
      ctx.globalAlpha = 1 / (i + 1);
      this.blitWheel(rot, c);
    });
    ctx.globalAlpha = 1;
    this.paintRim(c);
    if (this.hl) this.paintHighlight(now, c);

    const s = this.sliceAt();
    const id = s?.id ?? null;
    if (id !== this.lastPointerId) {
      this.lastPointerId = id;
      this.onPointerChange(s && { id: s.id, name: s.name });
    }

    if (this.transitioning || this.hl) this.requestDraw();
  }

  private blitWheel(rot: number, c: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rot * DEG);
    ctx.drawImage(this.off, -c, -c, this.size, this.size);
    ctx.restore();
  }

  private paintRim(c: number): void {
    const { ctx, theme } = this;
    const r = this.radius;
    const rw = this.rimWidth;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r + rw / 2, 0, Math.PI * 2);
    ctx.lineWidth = rw;
    ctx.strokeStyle = theme.rim;
    ctx.stroke();
    // subtle top-left highlight
    ctx.beginPath();
    ctx.arc(c, c, r + rw / 2, 200 * DEG, 290 * DEG);
    ctx.strokeStyle = theme.rimShine;
    ctx.lineWidth = rw * 0.45;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  /** Slice wedges in canvas degrees. Local angle 0 = top, clockwise → canvas angle = local − 90°. */
  private arcs(): { s: Slice; start: number; sweep: number }[] {
    const total = this.slices.reduce((a, s) => a + s.w, 0);
    let a = -90;
    const out: { s: Slice; start: number; sweep: number }[] = [];
    for (const s of this.slices) {
      const sweep = (s.w / total) * 360;
      if (sweep > 0.01) out.push({ s, start: a, sweep });
      a += sweep;
    }
    return out;
  }

  // ── Winner highlight ───────────────────────────────────────

  /** Light up one slice (and dim the rest); null fades the highlight out. */
  setHighlight(id: string | null): void {
    const now = performance.now();
    if (id) this.hl = { id, start: now, out: false };
    else if (this.hl && !this.hl.out) this.hl = { ...this.hl, start: now, out: true };
    this.requestDraw();
  }

  private paintHighlight(now: number, c: number): void {
    const hl = this.hl!;
    const elapsed = now - hl.start;
    const reduced = prefersReducedMotion();
    const dur = hl.out ? 260 : reduced ? 150 : 420;
    const raw = Math.min(1, elapsed / dur);
    if (hl.out && raw >= 1) {
      this.hl = null;
      return;
    }
    const p = hl.out ? 1 - EASE_OUT_FN(raw) : reduced ? raw : easeOutBack(raw);
    const arc = this.arcs().find((a) => a.s.id === hl.id);
    if (!arc) {
      this.hl = null;
      return;
    }
    const { ctx, theme } = this;
    const r = this.radius;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);

    // Dim everything else.
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * Math.min(1, p)})`;
    ctx.fill();

    // Winner wedge, pushed outward and enlarged.
    const { s, start, sweep } = arc;
    const mid = (start + sweep / 2) * DEG;
    const scale = reduced ? 1 : 1 + 0.07 * p;
    const push = reduced ? 0 : r * 0.035 * p;
    ctx.translate(c, c);
    ctx.rotate(this.rotation * DEG);
    ctx.translate(Math.cos(mid) * push, Math.sin(mid) * push);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, start * DEG, (start + sweep) * DEG);
    ctx.closePath();
    ctx.shadowColor = `rgba(255, 236, 170, ${0.6 + 0.35 * pulse})`;
    ctx.shadowBlur = 18 + 16 * pulse;
    ctx.fillStyle = css(mixRgb(PALETTE[s.color], [255, 255, 255], 0.12 + 0.1 * pulse));
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();

    // Label, even when the wheel's own labels are hidden (sized to fit).
    const textR = r * 0.6;
    const fs = Math.max(11, Math.min(r * 0.09, 30, sweep * DEG * textR * 0.8));
    const flip = mod(start + sweep / 2, 360) > 90 && mod(start + sweep / 2, 360) < 270;
    ctx.rotate(flip ? mid + Math.PI : mid);
    ctx.font = `800 ${fs}px ${theme.font}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = flip ? 'left' : 'right';
    ctx.fillStyle = LABEL_COLORS[s.color];
    const outer = r * 0.9;
    ctx.fillText(fitText(ctx, s.name, outer - r * 0.27), flip ? -outer : outer, 0);
    ctx.restore();
  }

  private paintSlices(): void {
    this.offDirty = false;
    const { offCtx: g, dpr, size, theme } = this;
    const c = size / 2;
    const r = this.radius;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);

    const total = this.slices.reduce((a, s) => a + s.w, 0);
    if (total <= 1e-6) {
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.fillStyle = theme.empty;
      g.fill();
      g.setLineDash([8, 8]);
      g.lineWidth = 2;
      g.strokeStyle = theme.emptyText;
      g.stroke();
      g.setLineDash([]);
      this.setLabels(true);
      return;
    }

    const arcs = this.arcs();
    for (const { s, start, sweep } of arcs) {
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, r, start * DEG, (start + sweep) * DEG);
      g.closePath();
      g.fillStyle = css(s.rgb, s.w1 === 0 ? Math.max(0.15, s.w) : 1);
      g.fill();
    }

    // Soft inner shading for depth.
    const shade = g.createRadialGradient(c, c, r * 0.15, c, c, r);
    shade.addColorStop(0, 'rgba(255,255,255,0.10)');
    shade.addColorStop(0.7, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.16)');
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fillStyle = shade;
    g.fill();

    const n = arcs.length;
    // Separators + pegs (skip when too dense to read).
    if (n > 1) {
      const sepW = n > 60 ? 0.6 : 1.4;
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = sepW;
      g.beginPath();
      for (const { start } of arcs) {
        g.moveTo(c, c);
        g.lineTo(c + r * Math.cos(start * DEG), c + r * Math.sin(start * DEG));
      }
      g.stroke();
      const minSweep = Math.min(...arcs.map((x) => x.sweep));
      if (minSweep >= 2.5) {
        const pr = Math.max(2, Math.min(5, r * 0.018));
        g.fillStyle = theme.peg;
        g.shadowColor = 'rgba(0,0,0,0.35)';
        g.shadowBlur = 3;
        for (const { start } of arcs) {
          g.beginPath();
          g.arc(c + (r - pr * 2.2) * Math.cos(start * DEG), c + (r - pr * 2.2) * Math.sin(start * DEG), pr, 0, Math.PI * 2);
          g.fill();
        }
        g.shadowBlur = 0;
      }
    }

    // Labels: sized to the slice's arc; hidden when too small to read.
    const sweep = 360 / Math.max(1, this.count || n);
    const textR = r * 0.6;
    const font = Math.min(r * 0.085, sweep * DEG * textR * 0.7, 30);
    const show = font >= MIN_FONT;
    this.setLabels(show);
    if (!show) return;
    const outer = r * 0.9;
    const inner = r * 0.27;
    g.textBaseline = 'middle';
    for (const { s, start, sweep: sw } of arcs) {
      const fs = Math.min(font, sw * DEG * textR * 0.7);
      if (fs < MIN_FONT * 0.8) continue;
      g.font = `700 ${fs}px ${theme.font}`;
      g.fillStyle = LABEL_COLORS[s.color];
      g.globalAlpha = s.w1 === 0 ? s.w : 1;
      // Soft shadow under white labels lifts contrast on the lighter slices.
      g.shadowColor = s.color === 2 ? 'transparent' : 'rgba(0, 0, 0, 0.35)';
      g.shadowBlur = 3;
      g.shadowOffsetY = 1;
      const mid = start + sw / 2; // canvas angle; 90°–270° is the left half
      const flip = mod(mid, 360) > 90 && mod(mid, 360) < 270;
      g.save();
      g.translate(c, c);
      g.rotate((flip ? mid + 180 : mid) * DEG);
      // Names read from the hub outwards on the right, and inwards on the left, so none are upside down.
      g.textAlign = flip ? 'left' : 'right';
      g.fillText(fitText(g, s.name, outer - inner), flip ? -outer : outer, 0);
      g.restore();
    }
    g.globalAlpha = 1;
    g.shadowColor = 'transparent';
    g.shadowBlur = g.shadowOffsetY = 0;
  }

  private setLabels(visible: boolean): void {
    if (visible === this.labels) return;
    this.labels = visible;
    this.onLabelsChange(visible);
  }
}

/** Truncate with an ellipsis to fit `max` px. */
function fitText(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.measureText(chars.slice(0, mid).join('') + '…').width <= max) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join('') + '…';
}
