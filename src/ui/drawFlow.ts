import { sfx } from '../audio/sfx';
import { feedback, flashClass, pop, shake } from '../fx/motion';
import { newId, updateSettings, type AppState, type Entry, type Store } from '../state/store';
import type { SpinEvents } from '../wheel/SpinController';
import type { Wheel } from '../wheel';
import { RevealCard } from './reveal';
import { toast } from './toast';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Batch {
  total: number;
  winners: Entry[];
  /** Pool before the batch, to restore winners when auto-remove is off. */
  original: readonly Entry[];
  startOrder: number;
  cancelled: boolean;
}

/**
 * Everything that happens around a spin: recording, the reveal card and its
 * buttons, fast mode for repeat draws, and "batch draw N".
 */
export class DrawFlow {
  private wheel!: Wheel;
  private readonly reveal = new RevealCard();
  private spins = 0;
  private batch: Batch | null = null;

  constructor(
    private readonly store: Store,
    private readonly announcer: HTMLElement,
  ) {}

  /** Wheel callbacks — pass to initWheel. */
  events(): SpinEvents {
    return {
      onStart: () => void this.spins++,
      onResult: (winner) => void this.onResult(winner),
    };
  }

  attach(wheel: Wheel): void {
    this.wheel = wheel;
    // Fast mode applies from the second draw of this visit onwards.
    wheel.controller.defaults = () => ({ fast: this.store.get().settings.fastMode && this.spins >= 1 });
    this.initControls();
  }

  // ── Single draw ────────────────────────────────────────────

  private async onResult(winner: Entry): Promise<void> {
    const order = this.record(winner);
    this.wheel.renderer.setHighlight(winner.id);
    if (this.batch) return this.batchStep(winner, order);

    const { controller, renderer, spotlight } = this.wheel;
    controller.blocked = true;
    sfx.reveal();
    await wait(140); // let the slice light up first (still well inside 0.3 s)
    const autoRemove = this.store.get().settings.removeWinner;
    const action = await this.reveal.open({ name: winner.name, order, autoRemove });

    renderer.setHighlight(null);
    spotlight.release(0);
    controller.blocked = false;
    const remove = action === 'remove' || (autoRemove && action !== 'keep');
    if (remove) {
      await wait(120);
      this.removeEntry(winner.id);
    }
    if (action === 'again') {
      await wait(remove ? 560 : 120);
      if (!controller.spin()) toast('獎池已經沒有人了', { type: 'error' });
    }
  }

  private record(winner: Entry): number {
    this.store.set((s) => ({ ...s, history: [...s.history, { id: newId(), name: winner.name, time: Date.now() }] }));
    const order = this.store.get().history.length;
    this.announcer.textContent = `第 ${order} 位得獎者：${winner.name}`;
    return order;
  }

  private removeEntry(id: string): void {
    this.store.set((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }));
  }

  // ── Batch draw ─────────────────────────────────────────────

  private startBatch(n: number): void {
    const { entries, history } = this.store.get();
    const { controller } = this.wheel;
    if (controller.spinning || this.reveal.isOpen || this.batch) return;
    this.batch = { total: n, winners: [], original: entries, startOrder: history.length + 1, cancelled: false };
    controller.blocked = true;
    document.querySelector('#batch-start')!.setAttribute('aria-disabled', 'true');
    this.tray.list.replaceChildren();
    this.updateTray();
    this.tray.root.hidden = false;
    this.tray.root.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    this.spinNext();
  }

  private spinNext(): void {
    if (!this.wheel.controller.spin({ fast: true })) void this.finishBatch();
  }

  private async batchStep(winner: Entry, order: number): Promise<void> {
    const b = this.batch!;
    const { renderer, spotlight } = this.wheel;
    sfx.ding();
    const r = document.querySelector('#wheel-stage')!.getBoundingClientRect();
    this.reveal.burst(r.left + r.width / 2, r.top + r.height * 0.2);

    const li = document.createElement('li');
    li.className = 'batch-chip';
    li.innerHTML = '<span class="batch-order"></span><span class="batch-name"></span>';
    li.children[0].textContent = `#${order}`;
    li.children[1].textContent = winner.name;
    this.tray.list.append(li);
    li.animate([{ opacity: 0, transform: 'scale(0.4) translateY(10px)' }, { opacity: 1, transform: 'none' }], {
      duration: 420,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    li.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    b.winners.push(winner);
    this.updateTray();

    await wait(700);
    renderer.setHighlight(null);
    spotlight.release(0);
    this.removeEntry(winner.id); // always during a batch, so every winner is distinct
    const done = b.winners.length >= b.total || b.cancelled || this.store.get().entries.length === 0;
    await wait(done ? 450 : 520);
    if (done) await this.finishBatch();
    else this.spinNext();
  }

  private async finishBatch(): Promise<void> {
    const b = this.batch;
    if (!b) return;
    this.batch = null;
    if (!this.store.get().settings.removeWinner) this.restore(b);
    this.tray.root.hidden = true;
    if (b.winners.length) {
      sfx.reveal();
      await this.reveal.openBatch(
        b.winners.map((w) => w.name),
        b.startOrder,
      );
    }
    this.wheel.controller.blocked = false;
    document.querySelector('#batch-start')!.setAttribute('aria-disabled', String(this.store.get().entries.length === 0));
  }

  /** Put batch winners back at their original positions (auto-remove off). */
  private restore(b: Batch): void {
    this.store.set((s) => {
      const keep = new Set([...s.entries, ...b.winners].map((e) => e.id));
      const originalIds = new Set(b.original.map((e) => e.id));
      const added = s.entries.filter((e) => !originalIds.has(e.id));
      const byId = new Map(s.entries.map((e) => [e.id, e]));
      return { ...s, entries: [...b.original.filter((e) => keep.has(e.id)).map((e) => byId.get(e.id) ?? e), ...added] };
    });
  }

  // ── Controls under the wheel ───────────────────────────────

  private tray!: { root: HTMLElement; list: HTMLOListElement; done: HTMLElement; total: HTMLElement };

  private updateTray(): void {
    const b = this.batch;
    if (!b) return;
    this.tray.done.textContent = String(b.winners.length);
    this.tray.total.textContent = String(b.total);
    pop(this.tray.done, 1.3);
  }

  private initControls(): void {
    const fast = document.querySelector<HTMLInputElement>('#opt-fast')!;
    const count = document.querySelector<HTMLInputElement>('#batch-count')!;
    const start = document.querySelector<HTMLButtonElement>('#batch-start')!;
    const label = document.querySelector<HTMLElement>('#batch-n')!;
    const root = document.querySelector<HTMLElement>('#batch-tray')!;
    this.tray = {
      root,
      list: root.querySelector('.batch-tray-list')!,
      done: root.querySelector('.batch-done')!,
      total: root.querySelector('.batch-total')!,
    };

    fast.addEventListener('change', () => updateSettings(this.store, { fastMode: fast.checked }));

    const clampCount = (v: number) => {
      const max = Math.max(1, this.store.get().entries.length);
      return Math.min(max, Math.max(1, Math.round(v) || 1));
    };
    const setCount = (v: number) => {
      const n = clampCount(v);
      if (count.value !== String(n)) count.value = String(n);
      if (label.textContent !== String(n)) {
        label.textContent = String(n);
        pop(label, 1.25);
      }
    };
    count.addEventListener('change', () => setCount(Number(count.value)));
    count.addEventListener('input', () => {
      if (count.value !== '') setCount(Number(count.value));
    });
    document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
      b.addEventListener('click', () => setCount(Number(count.value) + Number(b.dataset.step))),
    );

    start.addEventListener('click', () => {
      const pool = this.store.get().entries.length;
      if (this.wheel.controller.spinning || this.batch) return;
      if (pool === 0) {
        feedback(start, false);
        toast('名單是空的，先加入參加者', { type: 'error' });
        return;
      }
      const n = Number(count.value);
      if (!Number.isInteger(n) || n < 1 || n > pool) {
        shake(count.parentElement!);
        flashClass(count, 'is-error');
        toast(`請輸入 1 到 ${pool} 之間的人數`, { type: 'error' });
        return;
      }
      this.startBatch(n);
    });

    root.querySelector('#batch-stop')!.addEventListener('click', () => {
      if (!this.batch) return;
      this.batch.cancelled = true;
      this.wheel.controller.quickStop();
      toast('本輪結束後停止批次抽獎');
    });

    const render = (s: AppState, prev?: AppState) => {
      if (s.settings.fastMode !== prev?.settings.fastMode) fast.checked = s.settings.fastMode;
      if (s.entries !== prev?.entries) {
        count.max = String(Math.max(1, s.entries.length));
        if (!this.batch) setCount(Number(count.value));
        start.setAttribute('aria-disabled', String(s.entries.length === 0));
      }
    };
    render(this.store.get());
    this.store.subscribe(render);
  }
}
