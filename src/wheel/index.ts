import { flashClass, pop, shake } from '../fx/motion';
import type { Entry, Store } from '../state/store';
import { toast } from '../ui/toast';
import { SpinController, type SpinEvents } from './SpinController';
import { WheelRenderer } from './WheelRenderer';
import { initWheelInput } from './input';

/** Show the pointer name tag when there are more than this many entries (or labels are hidden). */
const NAMEPLATE_MIN = 20;

export interface Wheel {
  renderer: WheelRenderer;
  controller: SpinController;
}

export function initWheel(store: Store, events: SpinEvents = {}): Wheel {
  const stage = document.querySelector<HTMLElement>('#wheel-stage')!;
  const canvas = stage.querySelector<HTMLCanvasElement>('.wheel-canvas')!;
  const hub = stage.querySelector<HTMLButtonElement>('.wheel-hub')!;
  const chargeArc = stage.querySelector<SVGCircleElement>('.charge-arc')!;
  const nameplate = stage.querySelector<HTMLElement>('.nameplate')!;
  const nameplateText = nameplate.querySelector<HTMLElement>('.nameplate-text')!;

  const renderer = new WheelRenderer(canvas);

  const updateNameplate = () => {
    const n = store.get().entries.length;
    nameplate.hidden = n === 0 || (n <= NAMEPLATE_MIN && renderer.labelsVisible);
  };
  renderer.onPointerChange = (s) => {
    nameplateText.textContent = s?.name ?? '';
  };
  renderer.onLabelsChange = updateNameplate;

  const controller = new SpinController(renderer, store, {
    ...events,
    onStart() {
      stage.classList.add('is-spinning');
      hub.setAttribute('aria-label', '快停');
      events.onStart?.();
    },
    onQuickStop() {
      pop(hub, 0.9);
      events.onQuickStop?.();
    },
    onResult(winner: Entry, stop) {
      stage.classList.remove('is-spinning');
      hub.setAttribute('aria-label', '開始抽獎');
      events.onResult?.(winner, stop);
    },
  });

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
  });

  const sync = (entries: readonly Entry[], animate: boolean) => {
    renderer.setEntries(entries, animate);
    stage.classList.toggle('is-empty', entries.length === 0);
    hub.setAttribute('aria-disabled', String(entries.length === 0));
    updateNameplate();
  };
  sync(store.get().entries, false);
  store.subscribe((s, prev) => {
    if (s.entries !== prev.entries) sync(s.entries, true);
  });

  return { renderer, controller };
}
