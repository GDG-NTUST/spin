import { csvFileName, formatDateTime, resultsToCsv } from '../lib/csv';
import { EASE_OUT, EASE_SPRING, prefersReducedMotion, shake } from '../fx/motion';
import type { AppState, Store, Winner } from '../state/store';
import { downloadText } from './download';
import { toast } from './toast';

/** Draw history: newest first, new winners slide in at the top; CSV export and clear with undo. */
export function initHistoryPanel(store: Store): void {
  const list = document.querySelector<HTMLOListElement>('#history-list')!;
  const empty = document.querySelector<HTMLElement>('#history-empty')!;
  const exportBtn = document.querySelector<HTMLButtonElement>('#export-results')!;
  const clearBtn = document.querySelector<HTMLButtonElement>('#clear-history')!;

  clearBtn.addEventListener('click', () => {
    const prev = store.get().history;
    if (!prev.length) return void shake(clearBtn);
    store.set((s) => ({ ...s, history: [] }));
    toast(`已清除 ${prev.length} 筆紀錄`, { action: { label: '復原', run: () => store.set((s) => ({ ...s, history: prev })) } });
  });

  exportBtn.addEventListener('click', () => {
    const { history } = store.get();
    if (!history.length) {
      shake(exportBtn);
      toast('還沒有抽獎紀錄', { type: 'error' });
      return;
    }
    downloadText(csvFileName('結果'), resultsToCsv(history));
    toast(`已匯出 ${history.length} 筆紀錄`, { type: 'success' });
  });

  const nodes = new Map<string, HTMLLIElement>();

  const makeItem = (w: Winner, order: number) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = '<span class="history-order"></span><span class="history-name"></span><time class="history-time"></time>';
    li.children[0].textContent = `#${order}`;
    li.children[1].textContent = w.name;
    li.children[2].textContent = formatDateTime(w.time).slice(11);
    li.children[2].setAttribute('datetime', new Date(w.time).toISOString());
    return li;
  };

  const render = (s: AppState, prev?: AppState) => {
    if (s.history === prev?.history) return;
    const ids = new Set(s.history.map((w) => w.id));
    for (const [id, li] of nodes) if (!ids.has(id)) (li.remove(), nodes.delete(id));

    // FLIP: existing rows slide down to make room.
    const animate = !!prev && !prefersReducedMotion();
    const before = animate ? new Map([...nodes].map(([id, li]) => [id, li.getBoundingClientRect().top])) : null;

    const fresh: HTMLLIElement[] = [];
    s.history.forEach((w, i) => {
      if (nodes.has(w.id)) return;
      const li = makeItem(w, i + 1);
      nodes.set(w.id, li);
      list.prepend(li); // newest first
      fresh.push(li);
    });
    // Only animate genuinely new winners, not the initial restore from storage.
    if (animate) {
      for (const [id, top] of before!) {
        const li = nodes.get(id);
        const dy = li ? top - li.getBoundingClientRect().top : 0;
        if (li && dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 380, easing: EASE_OUT });
      }
      fresh.forEach((li, i) => {
        li.animate(
          [
            { opacity: 0, transform: 'translateY(-18px) scale(0.92)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 480, delay: i * 60, easing: EASE_SPRING, fill: 'backwards' },
        );
        li.classList.add('is-new');
        setTimeout(() => li.classList.remove('is-new'), 1600);
      });
    }
    empty.hidden = s.history.length > 0;
    exportBtn.setAttribute('aria-disabled', String(s.history.length === 0));
    clearBtn.setAttribute('aria-disabled', String(s.history.length === 0));
  };
  render(store.get());
  store.subscribe(render);
}
