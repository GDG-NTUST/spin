import { pop } from '../fx/motion';

/**
 * Rolling-digit counter. Each digit is a vertical 0–9 strip moved with a CSS
 * transform transition; new leading digits roll up from 0.
 */
export class Odometer {
  private value = -1;
  private readonly strips: HTMLElement[] = [];
  private readonly srText: HTMLElement;
  private readonly digits: HTMLElement;

  constructor(private readonly el: HTMLElement) {
    el.classList.add('odometer');
    this.digits = document.createElement('span');
    this.digits.className = 'odo-digits';
    this.digits.setAttribute('aria-hidden', 'true');
    this.srText = document.createElement('span');
    this.srText.className = 'visually-hidden';
    el.append(this.digits, this.srText);
  }

  set(n: number): void {
    if (n === this.value) return;
    const first = this.value < 0;
    const text = String(n);

    while (this.strips.length < text.length) {
      const digit = document.createElement('span');
      digit.className = 'odo-digit';
      const strip = document.createElement('span');
      strip.className = 'odo-strip';
      strip.textContent = '0123456789';
      digit.append(strip);
      this.digits.prepend(digit);
      this.strips.unshift(strip);
      void strip.offsetWidth; // start from 0 so the new digit rolls
    }
    while (this.strips.length > text.length) {
      this.strips.shift()!.parentElement!.remove();
    }

    text.split('').forEach((d, i) => {
      this.strips[i].style.transform = `translateY(${-Number(d) * 10}%)`;
    });
    this.srText.textContent = text;
    if (!first) pop(this.el, 1.08);
    this.value = n;
  }
}
