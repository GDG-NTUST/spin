import { EASE_IN, EASE_OUT, EASE_SPRING, prefersReducedMotion, shake } from '../fx/motion';
import type { Entry } from '../state/store';

/** Beyond these sizes animations are skipped to keep big lists snappy. */
const MAX_ANIMATED_ENTER = 60;
const MAX_ANIMATED_EXIT = 60;
const MAX_FLIP = 150;

export interface ChipListHandlers {
  /** Return an error message to reject the edit, or null to accept. */
  onRename(id: string, name: string): string | null;
  onRemove(id: string): void;
}

const COLORS = ['var(--blue)', 'var(--red)', 'var(--yellow)', 'var(--green)'];

export class ChipList {
  private readonly nodes = new Map<string, HTMLLIElement>();
  private editing: string | null = null;

  constructor(
    private readonly list: HTMLUListElement,
    private readonly handlers: ChipListHandlers,
  ) {
    list.addEventListener('click', (e) => this.onClick(e));
  }

  render(entries: readonly Entry[]): void {
    const reduced = prefersReducedMotion();
    const keep = new Set(entries.map((e) => e.id));
    const removed = [...this.nodes].filter(([id]) => !keep.has(id));
    const surviving = entries.filter((e) => this.nodes.has(e.id));
    const doFlip = !reduced && removed.length > 0 && surviving.length <= MAX_FLIP;

    // FLIP "first": positions before the change.
    const before = new Map<string, DOMRect>();
    if (doFlip) for (const e of surviving) before.set(e.id, this.nodes.get(e.id)!.getBoundingClientRect());

    // Exit: pin leaving chips where they are, then shrink + fade.
    const animateExit = !reduced && removed.length <= MAX_ANIMATED_EXIT;
    for (const [id, li] of removed) {
      this.nodes.delete(id);
      if (!animateExit) {
        li.remove();
        continue;
      }
      li.style.position = 'absolute';
      li.style.left = `${li.offsetLeft}px`;
      li.style.top = `${li.offsetTop}px`;
      li.style.pointerEvents = 'none';
      li.classList.add('is-leaving');
      li.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.4)' },
        ],
        { duration: 260, easing: EASE_IN, fill: 'forwards' },
      ).onfinish = () => li.remove();
    }

    // Reconcile order, create new chips.
    const added: HTMLLIElement[] = [];
    let cursor: Element | null = this.list.firstElementChild;
    entries.forEach((entry, i) => {
      let li = this.nodes.get(entry.id);
      if (!li) {
        li = this.createChip(entry);
        this.nodes.set(entry.id, li);
        added.push(li);
      } else if (li.dataset.name !== entry.name && this.editing !== entry.id) {
        this.setName(li, entry.name);
      }
      li.style.setProperty('--chip-color', COLORS[i % COLORS.length]);
      while (cursor && (cursor as HTMLElement).classList.contains('is-leaving')) cursor = cursor.nextElementSibling;
      if (cursor !== li) this.list.insertBefore(li, cursor);
      else cursor = cursor.nextElementSibling;
    });

    // FLIP "invert + play" for chips that shifted.
    if (doFlip) {
      for (const [id, first] of before) {
        const li = this.nodes.get(id)!;
        const last = li.getBoundingClientRect();
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        if (dx || dy) {
          li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
            duration: 320,
            easing: EASE_OUT,
          });
        }
      }
    }

    // Enter: staggered pop-in (capped so the whole wave stays under ~0.6 s).
    if (!reduced && added.length <= MAX_ANIMATED_ENTER) {
      const step = Math.min(35, 600 / Math.max(1, added.length));
      added.forEach((li, i) => {
        li.animate(
          [
            { opacity: 0, transform: 'translateY(8px) scale(0.5)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
          { duration: 420, delay: i * step, easing: EASE_SPRING, fill: 'backwards' },
        );
      });
    }
  }

  private createChip(entry: Entry): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'chip';
    li.dataset.id = entry.id;
    li.innerHTML = `
      <button type="button" class="chip-name" title="點選編輯"></button>
      <button type="button" class="chip-del">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>
      </button>`;
    this.setName(li, entry.name);
    return li;
  }

  private setName(li: HTMLLIElement, name: string): void {
    li.dataset.name = name;
    li.querySelector('.chip-name')!.textContent = name;
    li.querySelector('.chip-name')!.setAttribute('aria-label', `編輯 ${name}`);
    li.querySelector('.chip-del')!.setAttribute('aria-label', `刪除 ${name}`);
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const li = target.closest<HTMLLIElement>('.chip');
    if (!li || li.classList.contains('is-leaving')) return;
    const id = li.dataset.id!;
    if (target.closest('.chip-del')) {
      // Move focus somewhere sensible before the chip disappears.
      const next = (li.nextElementSibling ?? li.previousElementSibling) as HTMLElement | null;
      next?.querySelector<HTMLElement>('.chip-name')?.focus();
      this.handlers.onRemove(id);
    } else if (target.closest('.chip-name')) {
      this.startEdit(li);
    }
  }

  private startEdit(li: HTMLLIElement): void {
    if (this.editing) return;
    const id = li.dataset.id!;
    const original = li.dataset.name!;
    const nameBtn = li.querySelector<HTMLButtonElement>('.chip-name')!;
    const input = document.createElement('input');
    input.className = 'chip-input';
    input.value = original;
    input.setAttribute('aria-label', `編輯 ${original}`);
    input.size = Math.max(4, [...original].length + 2);
    this.editing = id;
    li.classList.add('is-editing');
    nameBtn.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (commit: boolean, fromBlur = false) => {
      if (done) return;
      const value = input.value.trim();
      if (commit && value !== original) {
        if (!value) {
          done = true;
          this.editing = null;
          input.replaceWith(nameBtn);
          this.handlers.onRemove(id);
          return;
        }
        const error = this.handlers.onRename(id, value);
        if (error) {
          shake(li);
          if (!fromBlur) {
            input.classList.add('is-invalid');
            input.focus();
            return;
          }
          // Leaving the field with an invalid value abandons the edit.
          commit = false;
        }
      }
      done = true;
      this.editing = null;
      li.classList.remove('is-editing');
      input.replaceWith(nameBtn);
      const renamed = commit && value !== original;
      if (renamed) this.setName(li, value);
      if (!fromBlur) nameBtn.focus();
      if (renamed) li.animate([{ filter: 'brightness(1.4)' }, { filter: 'none' }], { duration: 500 });
    };

    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      input.size = Math.max(4, [...input.value].length + 2);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true, true));
  }
}
