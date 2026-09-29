import { csvFileName, formatDateTime, resultsToCsv } from '../lib/csv';
import { shake } from '../fx/motion';
import type { AppState, Store } from '../state/store';
import { downloadText } from './download';
import { toast } from './toast';

/** Draw history list + results export. (Entry animations arrive with the reveal flow.) */
export function initHistoryPanel(store: Store): void {
  const list = document.querySelector<HTMLOListElement>('#history-list')!;
  const empty = document.querySelector<HTMLElement>('#history-empty')!;
  const exportBtn = document.querySelector<HTMLButtonElement>('#export-results')!;

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

  const render = (s: AppState, prev?: AppState) => {
    if (s.history === prev?.history) return;
    list.replaceChildren(
      ...s.history
        .map((w, i) => {
          const li = document.createElement('li');
          li.className = 'history-item';
          li.innerHTML = '<span class="history-order"></span><span class="history-name"></span><time class="history-time"></time>';
          li.children[0].textContent = `#${i + 1}`;
          li.children[1].textContent = w.name;
          li.children[2].textContent = formatDateTime(w.time).slice(11);
          li.children[2].setAttribute('datetime', new Date(w.time).toISOString());
          return li;
        })
        .reverse(),
    );
    empty.hidden = s.history.length > 0;
    exportBtn.setAttribute('aria-disabled', String(s.history.length === 0));
  };
  render(store.get());
  store.subscribe(render);
}
