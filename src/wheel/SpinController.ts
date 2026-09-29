import { secureRandom, secureRandomInt } from '../lib/random';
import {
  indexAt, mod, pegsCrossed, pickStop, planSpin, quickStop, turnsFor, velocityAt,
  type Dir, type SpinPlan, type Stop,
} from '../lib/spinMath';
import { prefersReducedMotion } from '../fx/motion';
import type { Entry, Store } from '../state/store';
import type { WheelRenderer } from './WheelRenderer';

export interface SpinOptions {
  /** 0–1 from a fling or space-bar charge; only affects turns/length, never the result. */
  strength?: number;
  dir?: Dir;
  /** Initial speed (deg/s, along dir) when released from a fling. */
  v0?: number;
  fast?: boolean;
}

export interface SpinEvents {
  onStart?(): void;
  /** Pegs passed this frame, and current speed in deg/s. */
  onTick?(pegs: number, speed: number): void;
  onFrame?(t: number, plan: SpinPlan): void;
  onQuickStop?(): void;
  onResult?(winner: Entry, stop: Stop): void;
}

/**
 * Drives one spin at a time. The winner is chosen with crypto *before* the
 * wheel moves; the animation is then solved to land on it.
 */
export class SpinController {
  private plan: SpinPlan | null = null;
  private t0 = 0;
  private snapshot: readonly Entry[] = [];
  private stop: Stop | null = null;
  private lastRot = 0;

  constructor(
    private readonly wheel: WheelRenderer,
    private readonly store: Store,
    private readonly events: SpinEvents = {},
  ) {}

  get spinning(): boolean {
    return this.plan !== null;
  }

  canSpin(): boolean {
    return !this.spinning && this.store.get().entries.length > 0;
  }

  spin({ strength, dir = 1, v0 = 0, fast = false }: SpinOptions = {}): boolean {
    if (!this.canSpin()) return false;
    const { entries, settings } = this.store.get();
    const reduced = prefersReducedMotion();

    this.wheel.setEntries(entries, false);
    this.wheel.lock();
    this.snapshot = entries;
    const n = entries.length;

    // 1. Decide the result.
    this.stop = pickStop(n, settings.nearMissRate, secureRandomInt, secureRandom);
    // 2. Solve the motion backwards from it.
    const from = mod(this.wheel.rotation, 360);
    this.plan = planSpin({
      from,
      n,
      stop: this.stop,
      dir,
      turns: turnsFor(strength, secureRandom, { fast, reduced }),
      timing: { fast, reduced, v0 },
    });
    this.wheel.setRotation(from);
    this.lastRot = from;
    this.t0 = performance.now();
    this.events.onStart?.();
    requestAnimationFrame((now) => this.frame(now));
    return true;
  }

  /** Brake to the already-decided result (≤ 0.6 s). */
  quickStop(): void {
    if (!this.plan) return;
    const t = (performance.now() - this.t0) / 1000;
    const q = quickStop(this.plan, t);
    if (!q) return;
    this.plan = q;
    this.t0 = performance.now();
    this.events.onQuickStop?.();
  }

  private frame(now: number): void {
    const plan = this.plan!;
    const t = (now - this.t0) / 1000;
    const done = t >= plan.duration;
    const rot = done ? plan.to : plan.angleAt(t);

    const n = this.snapshot.length;
    const pegs = n > 1 ? pegsCrossed(this.lastRot, rot, n) : 0;
    const speed = Math.abs(velocityAt(plan, t));
    if (pegs) this.events.onTick?.(pegs, speed);
    this.lastRot = rot;
    this.wheel.setRotation(rot);
    this.events.onFrame?.(t, plan);

    if (!done) {
      requestAnimationFrame((ts) => this.frame(ts));
      return;
    }
    this.finish(plan);
  }

  private finish(plan: SpinPlan): void {
    const stop = this.stop!;
    const winner = this.snapshot[stop.index];
    if (indexAt(plan.to, this.snapshot.length) !== stop.index) {
      console.error('spin landed outside the chosen segment', { stop, to: plan.to });
    }
    this.plan = null;
    this.wheel.setRotation(plan.to);
    this.wheel.unlock();
    this.events.onResult?.(winner, stop);
  }
}
