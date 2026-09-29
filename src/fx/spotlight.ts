/**
 * "Climax" atmosphere for the last second of a spin: the page dims and a
 * spotlight tightens around the wheel. A fixed overlay with a radial hole
 * positioned over the wheel; the hole radius is an animatable @property.
 */
export class Spotlight {
  private readonly el: HTMLDivElement;
  private active = false;
  private timer = 0;

  constructor(private readonly target: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'spotlight-dim';
    this.el.setAttribute('aria-hidden', 'true');
    document.body.append(this.el);
  }

  private place(): void {
    const r = this.target.getBoundingClientRect();
    this.el.style.setProperty('--spot-x', `${r.left + r.width / 2}px`);
    this.el.style.setProperty('--spot-y', `${r.top + r.height / 2}px`);
    this.el.style.setProperty('--spot-r', `${r.width / 2}px`);
  }

  focus(): void {
    clearTimeout(this.timer);
    if (this.active) return;
    this.active = true;
    this.place();
    document.documentElement.classList.add('is-climax');
  }

  release(delay = 0): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.active = false;
      document.documentElement.classList.remove('is-climax');
    }, delay);
  }
}
