import type { Dir } from '../lib/spinMath';
import type { SpinController } from './SpinController';
import type { WheelRenderer } from './WheelRenderer';

/** Fling speed (deg/s) needed to launch a spin, and the speed treated as "full strength". */
const FLING_MIN = 300;
const FLING_MAX = 2500;
/** Seconds of holding space for a full charge. */
const CHARGE_TIME = 1.1;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface WheelInputOptions {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  hub: HTMLButtonElement;
  chargeArc: SVGCircleElement;
  wheel: WheelRenderer;
  controller: SpinController;
  /** Called when a spin is requested with an empty pool. */
  onEmpty(): void;
  /** Wheel moved by hand (for tick sounds / pointer flicks). */
  onDragMove?(prevRot: number, rot: number): void;
}

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function initWheelInput(o: WheelInputOptions): void {
  const { stage, canvas, hub, chargeArc, wheel, controller } = o;

  const start = (opts: Parameters<SpinController['spin']>[0] = {}) => {
    if (!controller.spin(opts)) o.onEmpty();
  };

  // ── Hub button ─────────────────────────────────────────────
  hub.addEventListener('click', () => {
    if (controller.spinning) controller.quickStop();
    else if (!controller.blocked) start();
  });

  // ── Drag / fling ───────────────────────────────────────────
  let drag: { id: number; lastAngle: number; samples: { t: number; rot: number }[] } | null = null;

  const angleOf = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const insideWheel = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return Math.hypot(dx, dy) <= wheel.radius * 1.08;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!insideWheel(e)) return;
    if (controller.spinning) {
      controller.quickStop();
      return;
    }
    if (e.button !== 0 || controller.blocked) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, lastAngle: angleOf(e), samples: [{ t: e.timeStamp, rot: wheel.rotation }] };
    stage.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const a = angleOf(e);
    let delta = a - drag.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    drag.lastAngle = a;
    const prev = wheel.rotation;
    wheel.setRotation(prev + delta);
    o.onDragMove?.(prev, prev + delta);
    drag.samples.push({ t: e.timeStamp, rot: wheel.rotation });
    while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 100) drag.samples.shift();
  });

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const s = drag.samples;
    drag = null;
    stage.classList.remove('is-dragging');
    // Ignore samples older than 100 ms: a drag that stopped before release doesn't fling.
    const recent = s.filter((p) => e.timeStamp - p.t <= 100);
    if (recent.length < 2) return;
    const dt = (recent[recent.length - 1].t - recent[0].t) / 1000;
    if (dt <= 0) return;
    const omega = (recent[recent.length - 1].rot - recent[0].rot) / dt;
    if (Math.abs(omega) < FLING_MIN) return;
    const dir: Dir = omega > 0 ? 1 : -1;
    start({ dir, v0: Math.abs(omega), strength: clamp01((Math.abs(omega) - FLING_MIN) / (FLING_MAX - FLING_MIN)) });
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id) {
      drag = null;
      stage.classList.remove('is-dragging');
    }
  });

  // ── Space-bar charge ───────────────────────────────────────
  let charge: { t0: number; raf: number; value: number } | null = null;

  const setCharge = (v: number) => {
    chargeArc.style.strokeDashoffset = String(1 - v);
    stage.style.setProperty('--charge', v.toFixed(3));
  };
  const cancelCharge = () => {
    if (!charge) return;
    cancelAnimationFrame(charge.raf);
    charge = null;
    stage.classList.remove('is-charging');
    setCharge(0);
  };
  const chargeLoop = (now: number) => {
    if (!charge) return;
    charge.value = clamp01((now - charge.t0) / 1000 / CHARGE_TIME);
    setCharge(charge.value);
    stage.classList.toggle('is-charged', charge.value >= 1);
    charge.raf = requestAnimationFrame(chargeLoop);
  };

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || isEditable(e.target)) return;
    if (controller.blocked && !controller.spinning) return;
    // Space on other buttons keeps its normal meaning.
    if (e.target instanceof HTMLElement && e.target.closest('button, a, [role="button"], [role="switch"]') && e.target !== hub) return;
    e.preventDefault();
    if (e.repeat || charge) return;
    if (controller.spinning) {
      controller.quickStop();
      return;
    }
    if (!controller.canSpin()) {
      o.onEmpty();
      return;
    }
    charge = { t0: performance.now(), raf: 0, value: 0 };
    stage.classList.add('is-charging');
    charge.raf = requestAnimationFrame(chargeLoop);
  });

  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || !charge) return;
    e.preventDefault();
    const strength = charge.value;
    cancelCharge();
    stage.classList.remove('is-charged');
    start({ strength });
  });
  window.addEventListener('blur', cancelCharge);
}
