import { flashClass, shake } from '../fx/motion';

const ACCEPT = /\.(csv|txt|tsv)$/i;

/**
 * Click-or-drop file picker. `onFile` resolves true on success so the zone can
 * flash green, or false to shake red.
 */
export function initDropzone(
  zone: HTMLElement,
  input: HTMLInputElement,
  { onFile, onReject }: { onFile: (file: File) => Promise<boolean>; onReject: (file: File) => void },
): void {
  let depth = 0;

  const handle = async (file: File | undefined) => {
    if (!file) return;
    let ok = false;
    if (ACCEPT.test(file.name) || file.type.includes('csv') || file.type.startsWith('text/')) {
      zone.classList.add('is-busy');
      ok = await onFile(file);
      zone.classList.remove('is-busy');
    } else {
      onReject(file);
    }
    if (ok) flashClass(zone, 'is-success', 900);
    else {
      flashClass(zone, 'is-error', 900);
      shake(zone);
    }
  };

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    void handle(input.files?.[0]);
    input.value = '';
  });

  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (++depth === 1) zone.classList.add('is-dragover');
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      zone.classList.remove('is-dragover');
    }
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('is-dragover');
    void handle(e.dataTransfer?.files[0]);
  });

  // A file dropped elsewhere on the page must not navigate away.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}
