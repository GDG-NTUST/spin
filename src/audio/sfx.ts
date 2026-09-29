/**
 * All sounds are synthesised with Web Audio — no audio files.
 * The context is created lazily and resumed on the first user gesture
 * (required by iOS Safari / Chrome autoplay rules).
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Hard cap on ticks per second; beyond this the ticks blur into a whirr anyway. */
const MAX_TICK_RATE = 45;

class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private lastTick = 0;

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      // Gentle limiter so stacked ticks + the fanfare never clip.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(ctx.destination);
      this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(): AudioContext | null {
    return !this.muted && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  private env(ctx: AudioContext, at: number, peak: number, attack: number, decay: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(this.master);
    return g;
  }

  /**
   * One "tack" of a peg against the pointer. Pitch and brightness rise with
   * speed (deg/s); at high speed ticks are thinner so the stream stays pleasant.
   */
  tick(speed: number, delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const at = ctx.currentTime + delay;
    if (at - this.lastTick < 1 / MAX_TICK_RATE) return;
    this.lastTick = at;
    const k = clamp01(speed / 1600);
    const vol = 0.55 - 0.3 * k;

    // Noise click (the plastic "t")
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200 + 2000 * k;
    bp.Q.value = 3;
    src.connect(bp).connect(this.env(ctx, at, vol, 0.001, 0.025));
    src.start(at, Math.random() * 0.2, 0.04);

    // Short tonal body (the "ack")
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900 + 700 * k, at);
    osc.frequency.exponentialRampToValueAtTime(500 + 300 * k, at + 0.04);
    osc.connect(this.env(ctx, at, vol * 0.5, 0.002, 0.045));
    osc.start(at);
    osc.stop(at + 0.06);
  }

  /** Airy swoosh as the wheel launches. */
  whoosh(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const at = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, at);
    bp.frequency.exponentialRampToValueAtTime(2400, at + 0.35);
    src.connect(bp).connect(this.env(ctx, at, 0.35, 0.12, 0.35));
    src.start(at);
    src.stop(at + 0.55);
  }

  /** Short two-note chime for each winner inside a batch draw. */
  ding(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const at = ctx.currentTime + 0.01;
    [783.99, 1174.66].forEach((f, i) => {
      const t = at + i * 0.07;
      for (const [mult, gain] of [
        [1, 0.26],
        [2.01, 0.07],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mult;
        o.connect(this.env(ctx, t, gain, 0.005, i ? 0.55 : 0.2));
        o.start(t);
        o.stop(t + 0.65);
      }
    });
  }

  /** Reveal fanfare: rising major arpeggio with bell partials, then sparkles. */
  reveal(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const at = ctx.currentTime + 0.02;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      const t = at + i * 0.085;
      const last = i === notes.length - 1;
      for (const [mult, type, gain] of [
        [1, 'triangle', 0.32],
        [2, 'sine', 0.12],
        [3.01, 'sine', 0.05],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        o.connect(this.env(ctx, t, gain, 0.008, last ? 1.3 : 0.35));
        o.start(t);
        o.stop(t + (last ? 1.4 : 0.45));
      }
    });
    // Sparkles
    for (let i = 0; i < 7; i++) {
      const t = at + 0.35 + i * 0.07 + Math.random() * 0.04;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 2400 + Math.random() * 2400;
      o.connect(this.env(ctx, t, 0.06, 0.004, 0.18));
      o.start(t);
      o.stop(t + 0.25);
    }
  }
}

export const sfx = new Sfx();

/** Resume audio on the first interaction anywhere on the page. */
export function unlockAudioOnGesture(): void {
  const unlock = () => sfx.unlock();
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
}
