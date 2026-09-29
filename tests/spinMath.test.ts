import { describe, expect, it } from 'vitest';
import {
  NEAR_ENTER_DEPTH, NEAR_LEAVE_DEPTH, NORMAL_DEPTH, distanceTo, indexAt, makeSpin, makeSpinFrom, mod, pegsCrossed,
  pickStop, planSpin, pointerAngle, quickStop, segSize, stopLocalAngle, timingFor, turnsFor, velocityAt,
  type Dir, type NearMiss, type SpinPlan, type Stop,
} from '../src/lib/spinMath';

// Deterministic PRNG so failures are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const randInt = (n: number) => Math.floor(rand() * n);

/** Position within the segment under the pointer, 0–1 from its low edge. */
const fractionAt = (rot: number, n: number) => (pointerAngle(rot) / segSize(n)) % 1;

const sample = (plan: SpinPlan, from: number, to: number, step = 1 / 240) => {
  const out: { t: number; a: number }[] = [];
  for (let t = from; t <= to; t += step) out.push({ t, a: plan.angleAt(t) });
  return out;
};

describe('makeSpin', () => {
  it('reaches exactly A at t = a + d with zero speed', () => {
    for (const A of [360, 1800, 2880.5]) {
      const f = makeSpin(A, 0.25, 3.2);
      expect(f(0)).toBe(0);
      expect(f(3.45)).toBeCloseTo(A, 9);
      const h = 1e-5;
      expect((f(3.45) - f(3.45 - h)) / h).toBeLessThan(A * 1e-4);
    }
  });

  it('has continuous speed at the accel/decel joint and decelerates linearly', () => {
    const A = 2000;
    const f = makeSpin(A);
    const h = 1e-6;
    const vLeft = (f(0.25) - f(0.25 - h)) / h;
    const vRight = (f(0.25 + h) - f(0.25)) / h;
    expect(vRight).toBeCloseTo(vLeft, 1);
    const v = (2 * A) / 3.45;
    expect(vLeft).toBeCloseTo(v, 0);
    // Constant deceleration: speed halfway through decel is half the peak.
    expect((f(0.25 + 1.6 + h) - f(0.25 + 1.6)) / h).toBeCloseTo(v / 2, 0);
  });

  it('makeSpinFrom starts at v0 and still lands on A at rest', () => {
    const f = makeSpinFrom(2000, 600, 0.25, 3);
    const h = 1e-6;
    expect(f(h) / h).toBeCloseTo(600, 0);
    expect(f(3.25)).toBeCloseTo(2000, 9);
  });
});

describe('geometry', () => {
  it('pointerAngle / indexAt follow the clockwise convention', () => {
    expect(pointerAngle(0)).toBe(0);
    expect(pointerAngle(10)).toBe(350); // wheel turned 10° clockwise → pointer sees local 350°
    expect(indexAt(0, 4)).toBe(0);
    expect(indexAt(10, 4)).toBe(3);
    expect(indexAt(-100, 4)).toBe(1);
  });

  it('pegsCrossed counts boundaries in either direction', () => {
    expect(pegsCrossed(0, 5, 4)).toBe(1);
    expect(pegsCrossed(1, 89, 4)).toBe(0);
    expect(pegsCrossed(0, 720, 4)).toBe(8);
    expect(pegsCrossed(720, 0, 4)).toBe(8);
    expect(pegsCrossed(0, -91, 4)).toBe(1);
    expect(pegsCrossed(0, -181, 4)).toBe(2);
  });

  it('distanceTo brings the local angle under the pointer', () => {
    for (let i = 0; i < 200; i++) {
      const from = (rand() - 0.5) * 5000;
      const local = rand() * 360;
      for (const dir of [1, -1] as Dir[]) {
        const d = distanceTo(from, local, dir);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(360);
        expect(mod(pointerAngle(from + dir * d) - local + 180, 360) - 180).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('pickStop', () => {
  it('uses the injected fair source for the index', () => {
    const calls: number[] = [];
    const s = pickStop(10, 0, (n) => (calls.push(n), 7), () => 0.5);
    expect(s.index).toBe(7);
    expect(calls).toEqual([10]);
  });

  it('keeps normal stops within 15–85% of the segment', () => {
    for (let i = 0; i < 2000; i++) {
      const s = pickStop(12, 0, randInt, rand);
      expect(s.nearMiss).toBe('none');
      expect(s.depth).toBeGreaterThanOrEqual(NORMAL_DEPTH[0]);
      expect(s.depth).toBeLessThanOrEqual(NORMAL_DEPTH[1]);
    }
  });

  it('near-miss rate 1 always lands within 3–10% of an edge', () => {
    const seen = new Set<NearMiss>();
    for (let i = 0; i < 2000; i++) {
      const s = pickStop(12, 1, randInt, rand);
      seen.add(s.nearMiss);
      const [lo, hi] = s.nearMiss === 'enter' ? NEAR_ENTER_DEPTH : NEAR_LEAVE_DEPTH;
      expect(s.depth).toBeGreaterThanOrEqual(lo);
      expect(s.depth).toBeLessThanOrEqual(hi);
    }
    expect(seen).toEqual(new Set(['enter', 'leave']));
  });

  it('near-miss frequency follows the configured rate', () => {
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (pickStop(8, 0.25, randInt, rand).nearMiss !== 'none') hits++;
    expect(hits / 20000).toBeGreaterThan(0.23);
    expect(hits / 20000).toBeLessThan(0.27);
  });

  it('never near-misses with a single entry', () => {
    expect(pickStop(1, 1, randInt, rand).nearMiss).toBe('none');
  });
});

describe('turnsFor / timingFor', () => {
  it('gives 5–8 turns normally, 3–4 in fast mode, 0 when reduced', () => {
    for (let i = 0; i < 500; i++) {
      const t = turnsFor(undefined, rand);
      expect(t >= 5 && t <= 8 && Number.isInteger(t)).toBe(true);
      const f = turnsFor(undefined, rand, { fast: true });
      expect(f >= 3 && f <= 4).toBe(true);
    }
    expect(turnsFor(0, rand)).toBe(5);
    expect(turnsFor(1, rand)).toBe(8);
    expect(turnsFor(0.5, rand, { reduced: true })).toBe(0);
  });

  it('derives decel length from the angle', () => {
    expect(timingFor(5 * 360).decel).toBeLessThan(timingFor(8 * 360).decel);
  });
});

// ── The important one: every plan ends in the chosen segment ──────────────
type Case = { n: number; from: number; stop: Stop; dir: Dir; turns: number; fast: boolean; v0: number };

function randomCase(): Case {
  const n = 1 + randInt(rand() < 0.3 ? 5 : 300);
  const stop = pickStop(n, 0.5, randInt, rand);
  const fast = rand() < 0.3;
  return {
    n,
    from: (rand() - 0.5) * 10000,
    stop,
    dir: rand() < 0.7 ? 1 : -1,
    turns: turnsFor(undefined, rand, { fast }),
    fast,
    v0: rand() < 0.3 ? rand() * 3000 : 0,
  };
}

const CASES = Array.from({ length: 3000 }, randomCase);

function expectStop(plan: SpinPlan, c: Case) {
  const end = plan.angleAt(plan.duration);
  expect(end).toBeCloseTo(plan.to, 6);
  expect(plan.angleAt(plan.duration + 10)).toBe(plan.to);
  expect(indexAt(end, c.n)).toBe(c.stop.index);
  const f = fractionAt(end, c.n);
  const depth = c.dir > 0 ? 1 - f : f;
  expect(depth).toBeCloseTo(c.stop.depth, 6);
}

describe('planSpin', () => {
  it('always stops inside the pre-chosen segment at the chosen depth (3000 random cases)', () => {
    for (const c of CASES) {
      const plan = planSpin({ ...c, timing: { fast: c.fast, v0: c.v0 } });
      expectStop(plan, c);
    }
  });

  it('starts where the previous spin stopped', () => {
    for (const c of CASES.slice(0, 200)) {
      const plan = planSpin({ ...c, timing: { fast: c.fast } });
      expect(plan.angleAt(0)).toBe(c.from);
    }
  });

  it('takes ~3.3–3.9 s normally and < 2 s in fast mode', () => {
    for (const c of CASES.slice(0, 500)) {
      const plan = planSpin({ ...c, timing: { fast: c.fast } });
      if (c.fast) expect(plan.duration).toBeLessThan(2);
      else {
        expect(plan.duration).toBeGreaterThan(3.3);
        expect(plan.duration).toBeLessThan(3.9);
      }
    }
  });

  it('winds up 5–10° backwards within 0.15 s, then only moves forward until the overshoot', () => {
    for (const c of CASES.slice(0, 300)) {
      if (c.fast) continue;
      const plan = planSpin({ ...c, timing: {} });
      const back = Math.min(...sample(plan, 0, 0.15).map((s) => c.dir * (s.a - c.from)));
      expect(back).toBeLessThanOrEqual(-5 + 1e-6);
      expect(back).toBeGreaterThanOrEqual(-10 - 1e-6);
      const main = sample(plan, 0.15, plan.duration - 0.25);
      for (let i = 1; i < main.length; i++) expect(c.dir * (main[i].a - main[i - 1].a)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  // Constant deceleration: time below 60°/s is 60 / decel-rate ≈ 0.13 s at most.
  // (An exponential/easeOutQuint curve would spend seconds down there.)
  it('has no slow tail: under 60°/s for at most 0.15 s before the settle', () => {
    for (const c of CASES.slice(0, 300)) {
      if (c.fast || c.stop.nearMiss !== 'none') continue;
      const plan = planSpin({ ...c, timing: {} });
      const slowStart = plan.duration - 0.25; // settle phase begins
      let slow = 0;
      for (let t = 0.4; t < slowStart; t += 1 / 240) if (Math.abs(velocityAt(plan, t)) < 60) slow += 1 / 240;
      expect(slow).toBeLessThan(0.15);
    }
  });

  it('normal overshoot never leaves the target segment; a "leave" near-miss crosses the peg and returns', () => {
    for (const c of CASES) {
      const plan = planSpin({ ...c, timing: { fast: c.fast, v0: c.v0 } });
      const tail = sample(plan, plan.duration - 0.26, plan.duration, 1 / 600);
      const indices = new Set(tail.filter((s) => c.dir * (s.a - plan.to) >= 0).map((s) => indexAt(s.a, c.n)));
      if (c.stop.nearMiss === 'leave' && c.n > 1) expect(indices.size).toBeGreaterThan(1);
      else if (c.n > 1) expect([...indices]).toEqual([c.stop.index]);
    }
  });

  it('reduced motion: short, no wind-up, no overshoot, still exact', () => {
    for (const c of CASES.slice(0, 300)) {
      const plan = planSpin({ ...c, turns: 0, timing: { reduced: true } });
      expect(plan.duration).toBeLessThan(0.8);
      expect(plan.overshoot).toBe(0);
      expectStop(plan, c);
    }
  });

  it('stop angle helper matches the plan', () => {
    const stop: Stop = { index: 2, depth: 0.25, nearMiss: 'none' };
    expect(stopLocalAngle(stop, 4, 1)).toBe(2 * 90 + 0.75 * 90);
    expect(stopLocalAngle(stop, 4, -1)).toBe(2 * 90 + 0.25 * 90);
  });
});

describe('quickStop', () => {
  it('brakes to the same result within 0.6 s from any moment of the spin', () => {
    for (const c of CASES.slice(0, 600)) {
      const plan = planSpin({ ...c, timing: { fast: c.fast, v0: c.v0 } });
      const t = rand() * plan.duration;
      const q = quickStop(plan, t);
      if (!q) {
        expect(t).toBeGreaterThanOrEqual(plan.duration - 0.6);
        continue;
      }
      expect(q.duration).toBeLessThanOrEqual(0.6);
      expect(q.angleAt(0)).toBeCloseTo(plan.angleAt(t), 9);
      expectStop(q, c);
      expect(mod(q.to - plan.to + 180, 360) - 180).toBeCloseTo(0, 6);
    }
  });

  it('keeps moving forward while braking (no reversal) and continues the current speed', () => {
    for (const c of CASES.slice(0, 300)) {
      const plan = planSpin({ ...c, timing: { fast: c.fast } });
      const t = 0.4 + rand() * (plan.duration - 1.1);
      const q = quickStop(plan, t);
      if (!q) continue;
      const s = sample(q, 0, 0.45);
      for (let i = 1; i < s.length; i++) expect(c.dir * (s[i].a - s[i - 1].a)).toBeGreaterThanOrEqual(-1e-9);
      const v = velocityAt(plan, t);
      expect(Math.abs((q.angleAt(1e-4) - q.angleAt(0)) / 1e-4 - v)).toBeLessThan(Math.abs(v) * 0.02 + 5);
    }
  });
});
