import { sfx } from '../audio/sfx';
import { flashClass, pop, prefersReducedMotion, shake } from '../fx/motion';
import { Spotlight } from '../fx/spotlight';
import { pegsCrossed, velocityAt } from '../lib/spinMath';
import type { Entry, Store } from '../state/store';
import { toast } from '../ui/toast';
import { PointerFlick } from './Pointer';
import { SpinController, type SpinEvents } from './SpinController';
import { WheelRenderer } from './WheelRenderer';
import { initWheelInput } from './input';

/** Show the pointer name tag when there are more than this many entries (or labels are hidden). */
const NAMEPLATE_MIN = 20;
/** Motion blur kicks in above this speed (deg/s); below it names are readable again. */
const BLUR_MIN = 480;
/** Simulated shutter time for the blur, in seconds. */
const SHUTTER = 1 / 40;
/** The spotlight tightens when this many seconds remain. */
const CLIMAX_AT = 1.25;

/** Fewer blur samples on phones / low-core devices. */
const MAX_BLUR_SAMPLES =
  matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4 ? 4 : 7;

export interface Wheel {
  renderer: WheelRenderer;
  controller: SpinController;
  spotlight: Spotlight;
}

export function initWheel(store: Store, events: SpinEvents = {}): Wheel {
  const stage = document.querySelector<HTMLElement>('#wheel-stage')!;
  const canvas = stage.querySelector<HTMLCanvasElement>('.wheel-canvas')!;
  const hub = stage.querySelector<HTMLButtonElement>('.wheel-hub')!;
  const chargeArc = stage.querySelector<SVGCircleElement>('.charge-arc')!;
  const nameplate = stage.querySelector<HTMLElement>('.nameplate')!;
  const nameplateText = nameplate.querySelector<HTMLElement>('.nameplate-text')!;

  const renderer = new WheelRenderer(canvas);
  const pointer = new PointerFlick(stage.querySelector<HTMLElement>('.wheel-pointer')!);
  const spotlight = new Spotlight(stage);

  const updateNameplate = () => {
    const n = store.get().entries.length;
    nameplate.hidden = n === 0 || (n <= NAMEPLATE_MIN && renderer.labelsVisible);
  };
  renderer.onPointerChange = (s) => {
    nameplateText.textContent = s?.name ?? '';
  };
  renderer.onLabelsChange = updateNameplate;

  /** One peg hit: sound + pointer flick. Several pegs in one frame are spread across it. */
  const pegHit = (pegs: number, speed: number, dir: number) => {
    pointer.kick(dir, speed);
    const extra = Math.min(pegs, 3);
    for (let i = 0; i < extra; i++) sfx.tick(speed, (i / extra) * (1 / 60));
  };

  const controller = new SpinController(renderer, store, {
    ...events,
    onStart() {
      stage.classList.add('is-spinning');
      hub.setAttribute('aria-label', '停下');
      sfx.whoosh();
      events.onStart?.();
    },
    onTick(pegs, speed, dir) {
      pegHit(pegs, speed, dir);
      events.onTick?.(pegs, speed, dir);
    },
    onFrame(t, plan, rot) {
      const speed = Math.abs(velocityAt(plan, t));
      if (speed > BLUR_MIN && !prefersReducedMotion()) {
        const n = Math.max(2, Math.min(MAX_BLUR_SAMPLES, Math.round(speed / 220)));
        renderer.trail = Array.from({ length: n - 1 }, (_, i) => plan.angleAt(t - ((n - 1 - i) / (n - 1)) * SHUTTER));
      } else {
        renderer.trail = [];
      }
      stage.classList.toggle('is-blurring', renderer.trail.length > 0);
      if (plan.duration - t <= CLIMAX_AT) spotlight.focus();
      events.onFrame?.(t, plan, rot);
    },
    onQuickStop() {
      pop(hub, 0.9);
      events.onQuickStop?.();
    },
    onResult(winner: Entry, stop) {
      stage.classList.remove('is-spinning', 'is-blurring');
      hub.setAttribute('aria-label', '開始抽獎');
      events.onResult?.(winner, stop);
    },
  });

  // Hand-dragging the wheel also plucks the pegs.
  let lastDrag = performance.now();
  initWheelInput({
    stage,
    canvas,
    hub,
    chargeArc,
    wheel: renderer,
    controller,
    onEmpty() {
      shake(stage);
      flashClass(hub, 'is-error');
      toast('名單是空的，先加入參加者', { type: 'error' });
    },
    onDragMove(prev, rot) {
      const now = performance.now();
      const dt = Math.max(1, now - lastDrag) / 1000;
      lastDrag = now;
      const n = store.get().entries.length;
      const pegs = n > 1 ? pegsCrossed(prev, rot, n) : 0;
      if (pegs) pegHit(pegs, Math.abs(rot - prev) / dt, Math.sign(rot - prev));
    },
  });

  const sync = (entries: readonly Entry[], animate: boolean) => {
    renderer.setEntries(entries, animate);
    stage.classList.toggle('is-empty', entries.length === 0);
    hub.setAttribute('aria-disabled', String(entries.length === 0));
    canvas.setAttribute('aria-label', entries.length ? `抽獎輪盤，共 ${entries.length} 人` : '抽獎輪盤（尚無名單）');
    updateNameplate();
  };
  sync(store.get().entries, false);
  store.subscribe((s, prev) => {
    if (s.entries !== prev.entries) sync(s.entries, true);
  });

  return { renderer, controller, spotlight };
}
