import { prefersReducedMotion } from '../fx/motion';

/** Spring constants for the pointer's snap-back (≈ 0.2 s period, lightly damped). */
const STIFFNESS = 900;
const DAMPING = 18;

/**
 * The pointer gets flicked sideways by each peg and springs back. At high
 * speed the next peg arrives before it recovers, so it hovers deflected —
 * which reads as "it's going fast" without any extra logic.
 */
export class PointerFlick {
  private angle = 0;
  private vel = 0;
  private raf = 0;
  private last = 0;

  constructor(private readonly el: HTMLElement) {}

  /** dir: wheel direction (+1 clockwise); speed in deg/s. */
  kick(dir: number, speed: number): void {
    if (prefersReducedMotion()) return;
    // A clockwise wheel drags the pointer tip to the right → negative CSS rotation.
    const amp = Math.min(26, 9 + speed / 90);
    const target = -Math.sign(dir || 1) * amp;
    if (Math.abs(this.angle) < amp || Math.sign(this.angle) !== Math.sign(target)) {
      this.angle = target;
      this.vel = 0;
    }
    this.start();
  }

  private start(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.step(t));
  }

  private step(now: number): void {
    const dt = Math.min(0.032, (now - this.last) / 1000);
    this.last = now;
    // Semi-implicit Euler, two sub-steps for stability at 30 fps.
    for (let i = 0; i < 2; i++) {
      const h = dt / 2;
      this.vel += (-STIFFNESS * this.angle - DAMPING * this.vel) * h;
      this.angle += this.vel * h;
    }
    const resting = Math.abs(this.angle) < 0.05 && Math.abs(this.vel) < 0.5;
    if (resting) this.angle = this.vel = 0;
    this.el.style.rotate = `${this.angle.toFixed(2)}deg`;
    this.raf = resting ? 0 : requestAnimationFrame((t) => this.step(t));
  }
}
