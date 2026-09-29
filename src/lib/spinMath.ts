/**
 * Wheel geometry & spin timeline — pure functions, no DOM.
 *
 * Conventions
 * - `rot` is the wheel rotation in degrees, unbounded; +1 = clockwise.
 * - Segment i covers wheel-local angles [i·s, (i+1)·s), s = 360/n, measured
 *   clockwise from the wheel's reference line.
 * - The pointer is fixed at the top; it points at wheel-local angle mod(-rot, 360).
 * - The result is decided first (see pickStop); the timeline is solved backwards
 *   so it ends exactly on that stop. Nothing physical decides the winner.
 */

export type Dir = 1 | -1;
/** 'enter' = just squeezed past the entry boundary; 'leave' = overshoots onto the next peg, then falls back. */
export type NearMiss = 'none' | 'enter' | 'leave';

export interface Stop {
  index: number;
  /** How far into the segment the pointer rests, measured from the edge it enters through (0–1). */
  depth: number;
  nearMiss: NearMiss;
}

export const NORMAL_DEPTH: readonly [number, number] = [0.15, 0.85];
export const NEAR_ENTER_DEPTH: readonly [number, number] = [0.03, 0.1];
export const NEAR_LEAVE_DEPTH: readonly [number, number] = [0.9, 0.97];

export const mod = (a: number, m: number): number => ((a % m) + m) % m;
export const segSize = (n: number): number => 360 / n;
const lerp = ([lo, hi]: readonly [number, number], u: number) => lo + (hi - lo) * u;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Wheel-local angle currently under the pointer, in [0, 360). */
export const pointerAngle = (rot: number): number => mod(-rot, 360);

/** Index of the segment under the pointer. */
export function indexAt(rot: number, n: number): number {
  return Math.min(n - 1, Math.floor(pointerAngle(rot) / segSize(n)));
}

/** Number of segment boundaries (pegs) passed between two unwrapped rotations. */
export function pegsCrossed(rot0: number, rot1: number, n: number): number {
  const s = segSize(n);
  return Math.abs(Math.floor(-rot1 / s) - Math.floor(-rot0 / s));
}

/**
 * Decide the outcome. `randInt` must be a fair integer source (crypto in production);
 * `rand` only shapes where inside the segment the pointer rests.
 */
export function pickStop(
  n: number,
  nearMissRate: number,
  randInt: (n: number) => number,
  rand: () => number,
): Stop {
  const index = randInt(n);
  if (n > 1 && rand() < nearMissRate) {
    const nearMiss: NearMiss = rand() < 0.5 ? 'enter' : 'leave';
    return { index, nearMiss, depth: lerp(nearMiss === 'enter' ? NEAR_ENTER_DEPTH : NEAR_LEAVE_DEPTH, rand()) };
  }
  return { index, nearMiss: 'none', depth: lerp(NORMAL_DEPTH, rand()) };
}

/** Wheel-local angle the pointer must finally rest on. */
export function stopLocalAngle(stop: Stop, n: number, dir: Dir): number {
  // Turning clockwise, the pointer sweeps local angles downward, entering each segment at its high edge.
  const f = dir > 0 ? 1 - stop.depth : stop.depth;
  return (stop.index + f) * segSize(n);
}

/** Rotation needed (0–360) in direction `dir` to bring local angle `local` under the pointer. */
export function distanceTo(from: number, local: number, dir: Dir): number {
  return dir > 0 ? mod(-local - from, 360) : mod(local + from, 360);
}

/**
 * Overshoot past the stop before settling back. Normal stops stay inside the
 * segment; a 'leave' near-miss deliberately crosses the next peg and returns.
 */
export function overshootFor(stop: Stop, n: number): number {
  const s = segSize(n);
  const room = (1 - stop.depth) * s; // distance to the exit edge
  if (stop.nearMiss === 'leave') return room + clamp(0.3 * s, 0.6, 3);
  return Math.min(4, 0.6 * room);
}

// ── Speed curve ──────────────────────────────────────────────

/**
 * Constant-acceleration burst then constant deceleration to rest — no long tail.
 * A: total angle, a: accel seconds, d: decel seconds. Ends at t = a + d with
 * position A and speed 0.
 */
export function makeSpin(A: number, a = 0.25, d = 3.2): (t: number) => number {
  const v = (2 * A) / (a + d); // peak angular speed
  return (t) =>
    t < a ? 0.5 * (v / a) * t * t : 0.5 * v * a + v * (t - a) - 0.5 * (v / d) * (t - a) ** 2;
}

/** Same curve, but starting at speed v0 (used after a fling). */
export function makeSpinFrom(A: number, v0: number, a: number, d: number): (t: number) => number {
  const v = (2 * A - v0 * a) / (a + d);
  return (t) =>
    t < a
      ? v0 * t + 0.5 * ((v - v0) / a) * t * t
      : 0.5 * (v0 + v) * a + v * (t - a) - 0.5 * (v / d) * (t - a) ** 2;
}

export interface SpinTiming {
  /** Seconds of backwards wind-up (0 = none). */
  windup: number;
  windupDeg: number;
  accel: number;
  decel: number;
  /** Seconds to fall back from the overshoot. */
  settle: number;
}

export interface TimingOptions {
  fast?: boolean;
  reduced?: boolean;
  /** Starting speed along the spin direction (deg/s), e.g. from a fling. Skips the wind-up. */
  v0?: number;
}

/** Full turns for a spin. strength 0–1 (fling / charge); random when omitted. */
export function turnsFor(strength: number | undefined, rand: () => number, { fast = false, reduced = false } = {}): number {
  if (reduced) return 0;
  const [lo, hi] = fast ? [3, 4] : [5, 8];
  const u = strength === undefined ? rand() : clamp(strength, 0, 1);
  return lo + Math.min(hi - lo, Math.floor(u * (hi - lo + 1)));
}

/** Phase lengths derived from the total angle, so more turns ⇒ slightly longer glide. */
export function timingFor(angle: number, { fast = false, reduced = false, v0 = 0 }: TimingOptions = {}): SpinTiming {
  if (reduced) return { windup: 0, windupDeg: 0, accel: 0.12, decel: 0.55, settle: 0 };
  const fling = v0 > 0;
  if (fast) {
    const k = clamp((angle - 3 * 360) / 720, 0, 1);
    return { windup: fling ? 0 : 0.1, windupDeg: fling ? 0 : 4, accel: 0.15, decel: 1.2 + 0.25 * k, settle: 0.18 };
  }
  const k = clamp((angle - 5 * 360) / (3 * 360), 0, 1);
  return {
    windup: fling ? 0 : 0.15,
    windupDeg: fling ? 0 : 5 + 5 * k,
    accel: 0.25,
    decel: 2.7 + 0.5 * k,
    settle: 0.25,
  };
}

// ── Plans ────────────────────────────────────────────────────

export interface SpinPlan {
  from: number;
  /** Exact final rotation. */
  to: number;
  dir: Dir;
  /** Seconds. */
  duration: number;
  overshoot: number;
  /** Rotation at time t (seconds since start). Clamped outside [0, duration]. */
  angleAt(t: number): number;
}

const settleCurve = (u: number) => (1 + Math.cos(Math.PI * u)) / 2; // 1 → 0, flat at both ends

export interface PlanInput {
  from: number;
  n: number;
  stop: Stop;
  dir: Dir;
  turns: number;
  timing?: TimingOptions;
}

export function planSpin({ from, n, stop, dir, turns, timing: opts = {} }: PlanInput): SpinPlan {
  const dist = distanceTo(from, stopLocalAngle(stop, n, dir), dir) + 360 * turns;
  const o = opts.reduced ? 0 : overshootFor(stop, n);
  const tm = timingFor(dist, opts);
  const w = tm.windupDeg;
  // A fling faster than the natural peak would make the burst phase brake instead.
  const v0 = clamp(opts.v0 ?? 0, 0, (2 * (dist + o + w)) / (tm.accel + tm.decel));
  const main = v0 > 0 ? makeSpinFrom(dist + o + w, v0, tm.accel, tm.decel) : makeSpin(dist + o + w, tm.accel, tm.decel);
  const t1 = tm.windup;
  const t2 = t1 + tm.accel + tm.decel;
  const T = t2 + tm.settle;

  const offset = (t: number): number => {
    if (t <= 0) return 0;
    if (t < t1) return (-w * (1 - Math.cos((Math.PI * t) / t1))) / 2;
    if (t < t2) return -w + main(t - t1);
    if (t < T) return dist + o * settleCurve((t - t2) / tm.settle);
    return dist;
  };

  return { from, to: from + dir * dist, dir, duration: T, overshoot: o, angleAt: (t) => from + dir * offset(t) };
}

/** Numerical angular velocity (deg/s, signed). */
export function velocityAt(plan: SpinPlan, t: number, h = 1 / 240): number {
  return (plan.angleAt(t + h) - plan.angleAt(t - h)) / (2 * h);
}

/**
 * "Quick stop": from time t of `plan`, brake to the *same* result within
 * `brake + settle` seconds (default 0.6 s). Returns null when the plan will
 * finish sooner anyway.
 */
export function quickStop(plan: SpinPlan, t: number, { brake = 0.45, settle = 0.15 } = {}): SpinPlan | null {
  if (t >= plan.duration - (brake + settle)) return null;
  const { dir, overshoot: o } = plan;
  const from = plan.angleAt(t);
  const omega = Math.max(0, dir * velocityAt(plan, t));

  // Same resting place modulo whole turns. Cubic Hermite stays monotonic while
  // the distance is at least a third of the "coasting" distance.
  let D = mod(dir * (plan.to - from), 360);
  while (D + o < (omega * brake) / 3) D += 360;
  const S = D + o;
  const m = omega * brake;

  const offset = (tt: number): number => {
    if (tt <= 0) return 0;
    if (tt < brake) {
      const u = tt / brake;
      return (-2 * u ** 3 + 3 * u ** 2) * S + (u ** 3 - 2 * u ** 2 + u) * m;
    }
    if (tt < brake + settle) return D + o * settleCurve((tt - brake) / settle);
    return D;
  };

  return {
    from,
    to: from + dir * D,
    dir,
    duration: brake + settle,
    overshoot: o,
    angleAt: (tt) => from + dir * offset(tt),
  };
}
