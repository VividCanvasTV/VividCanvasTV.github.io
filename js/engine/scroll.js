// The master timeline input. Native scroll owns the position (free keyboard,
// touch momentum, scrollbar, screen-reader compatibility) — we only add
// physicality: a critically-damped smoothed value + velocity for the engine.

import { damp, clamp } from './math.js';

export class ScrollTimeline {
  constructor(runwayEl, viewportHeights = 14) {
    this.runway = runwayEl;
    this.vh = viewportHeights;
    this.raw = 0;        // instantaneous 0..1
    this.progress = 0;   // smoothed 0..1 — what the engine consumes
    this.velocity = 0;   // d(progress)/dt, signed
    this.max = 1;
    this._lastP = 0;
    this.resize();
    addEventListener('scroll', () => this._read(), { passive: true });
    addEventListener('resize', () => this.resize(), { passive: true });
    this._read();
    // a reload mid-story must resume in place, not fast-forward five acts
    this.progress = this.raw;
    this._lastP = this.raw;
  }
  resize() {
    this.runway.style.height = `${this.vh * 100}vh`;
    const vh = innerHeight || document.documentElement.clientHeight || 720;
    const run = this.runway.offsetHeight || vh * this.vh;
    this.max = Math.max(1, run - vh);
    this._read();
  }
  _read() {
    this.raw = clamp(scrollY / this.max, 0, 1);
  }
  update(dt) {
    if (this.max <= 1) this.resize();   // layout arrived late — re-measure
    this.progress = damp(this.progress, this.raw, 4.2, dt);
    if (Math.abs(this.progress - this.raw) < 1e-5) this.progress = this.raw;
    this.velocity = damp(this.velocity, (this.progress - this._lastP) / Math.max(dt, 1e-4), 8, dt);
    this._lastP = this.progress;
  }
  scrollToProgress(p, smooth = true) {
    scrollTo({ top: p * this.max, behavior: smooth ? 'smooth' : 'auto' });
  }
}
