import { csvFileName, decodeCsvBytes, extractNamesFromCsv, namesToCsv } from '../lib/csv';
import { duplicateIndices, mergeNames, nameKey, parseEntries } from '../lib/parseEntries';
import { feedback, flashClass, shake } from '../fx/motion';
import { toEntries, updateSettings, type AppState, type Entry, type ImportMode, type Store } from '../state/store';
import { ChipList } from './chipList';
import { downloadText } from './download';
import { initDropzone } from './dropzone';
import { Odometer } from './odometer';
import { toast } from './toast';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

export function initEntryPanel(store: Store): void {
  const textarea = $<HTMLTextAreaElement>('#entry-input');
  const addBtn = $<HTMLButtonElement>('#entry-add');
  const dedupe = $<HTMLInputElement>('#opt-dedupe');
  const removeWinner = $<HTMLInputElement>('#opt-remove-winner');
  const exportBtn = $<HTMLButtonElement>('#export-entries');
  const clearBtn = $<HTMLButtonElement>('#clear-entries');
  const empty = $<HTMLElement>('#entries-empty');
  const importModes = document.querySelectorAll<HTMLInputElement>('input[name="import-mode"]');

  const counter = new Odometer($('#entry-count'));
  const setEntries = (entries: Entry[]) => store.set((s) => ({ ...s, entries }));
  const restore = (entries: Entry[]) => ({ label: '復原', run: () => setEntries(entries) });

  const chips = new ChipList($<HTMLUListElement>('#chip-list'), {
    onRename(id, name) {
      const { entries, settings } = store.get();
      if (settings.dedupe && entries.some((e) => e.id !== id && nameKey(e.name) === nameKey(name))) {
        toast(`「${name}」已在名單中`, { type: 'error' });
        return 'duplicate';
      }
      setEntries(entries.map((e) => (e.id === id ? { ...e, name } : e)));
      return null;
    },
    onRemove(id) {
      const prev = store.get().entries;
      const gone = prev.find((e) => e.id === id);
      setEntries(prev.filter((e) => e.id !== id));
      if (gone) toast(`已刪除「${gone.name}」`, { action: restore(prev) });
    },
  });

  // ── Batch input ──────────────────────────────────────────
  const addFromTextarea = () => {
    const { entries, settings } = store.get();
    const parsed = parseEntries(textarea.value, { dedupe: settings.dedupe });
    if (parsed.length === 0) {
      feedback(addBtn, false);
      shake(textarea);
      flashClass(textarea, 'is-error');
      toast('沒有可加入的名字', { type: 'error' });
      textarea.focus();
      return;
    }
    const { added } = mergeNames(entries.map((e) => e.name), parsed, settings.dedupe);
    const totalSkipped = parseEntries(textarea.value, { dedupe: false }).length - added.length;
    if (added.length === 0) {
      shake(textarea);
      toast(`${totalSkipped} 筆都已在名單中`, { type: 'error' });
      return;
    }
    setEntries([...entries, ...toEntries(added)]);
    feedback(addBtn, true);
    textarea.value = '';
    flashClass(textarea, 'is-success');
    toast(`已加入 ${added.length} 人${totalSkipped ? `，略過 ${totalSkipped} 筆重複` : ''}`, { type: 'success' });
  };

  addBtn.addEventListener('click', addFromTextarea);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      addFromTextarea();
    }
  });

  // ── Settings ─────────────────────────────────────────────
  dedupe.addEventListener('change', () => {
    updateSettings(store, { dedupe: dedupe.checked });
    if (!dedupe.checked) return;
    const prev = store.get().entries;
    const dupes = new Set(duplicateIndices(prev.map((e) => e.name)));
    if (dupes.size) {
      setEntries(prev.filter((_, i) => !dupes.has(i)));
      toast(`已移除 ${dupes.size} 筆重複`, { type: 'success', action: restore(prev) });
    }
  });
  removeWinner.addEventListener('change', () => updateSettings(store, { removeWinner: removeWinner.checked }));
  importModes.forEach((r) =>
    r.addEventListener('change', () => r.checked && updateSettings(store, { importMode: r.value as ImportMode })),
  );

  // ── CSV import ───────────────────────────────────────────
  initDropzone($('#dropzone'), $<HTMLInputElement>('#csv-input'), {
    async onFile(file) {
      let names: string[];
      let hasHeader: boolean;
      try {
        ({ names, hasHeader } = extractNamesFromCsv(decodeCsvBytes(new Uint8Array(await file.arrayBuffer()))));
      } catch {
        toast('無法讀取這個檔案', { type: 'error' });
        return false;
      }
      if (names.length === 0) {
        toast('檔案中沒有找到名字', { type: 'error' });
        return false;
      }
      const { entries, settings } = store.get();
      const replace = settings.importMode === 'replace';
      const unique = settings.dedupe ? mergeNames([], names, true).added : names;
      const { added } = mergeNames(replace ? [] : entries.map((e) => e.name), unique, settings.dedupe);
      if (added.length === 0) {
        toast('檔案中的名字都已在名單中', { type: 'error' });
        return false;
      }
      setEntries(replace ? toEntries(added) : [...entries, ...toEntries(added)]);
      const skipped = names.length - added.length;
      toast(
        `${replace ? '已取代為' : '已匯入'} ${added.length} 人` +
          (skipped ? `，略過 ${skipped} 筆重複` : '') +
          (hasHeader ? '（已略過標題列）' : ''),
        { type: 'success', action: replace && entries.length ? restore(entries) : undefined },
      );
      return true;
    },
    onReject(file) {
      toast(`不支援「${file.name}」，請使用 CSV 或文字檔`, { type: 'error' });
    },
  });

  // ── Export / clear ───────────────────────────────────────
  exportBtn.addEventListener('click', () => {
    const { entries } = store.get();
    if (!entries.length) {
      feedback(exportBtn, false);
      toast('名單是空的', { type: 'error' });
      return;
    }
    feedback(exportBtn, true);
    downloadText(csvFileName('名單'), namesToCsv(entries.map((e) => e.name)));
    toast(`已匯出 ${entries.length} 人`, { type: 'success' });
  });

  clearBtn.addEventListener('click', () => {
    const prev = store.get().entries;
    if (!prev.length) {
      feedback(clearBtn, false);
      return;
    }
    setEntries([]);
    toast(`已清空 ${prev.length} 人`, { action: restore(prev) });
  });

  // ── Render ───────────────────────────────────────────────
  const render = (s: AppState, prev?: AppState) => {
    if (s.entries !== prev?.entries) {
      chips.render(s.entries);
      counter.set(s.entries.length);
      empty.hidden = s.entries.length > 0;
      // aria-disabled (not disabled) so a click can still give error feedback
      exportBtn.setAttribute('aria-disabled', String(s.entries.length === 0));
      clearBtn.setAttribute('aria-disabled', String(s.entries.length === 0));
    }
    if (s.settings !== prev?.settings) {
      dedupe.checked = s.settings.dedupe;
      removeWinner.checked = s.settings.removeWinner;
      importModes.forEach((r) => (r.checked = r.value === s.settings.importMode));
    }
  };
  render(store.get());
  store.subscribe(render);
}
