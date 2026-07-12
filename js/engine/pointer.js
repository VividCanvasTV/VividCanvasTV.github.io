// Pointer as brush. Smoothed position + velocity feed the fluid splats,
// particle disturbance, camera drift and light. Touch works while scrolling.

import { damp } from './math.js';

export class Pointer {
  constructor(el) {
    // normalized 0..1, y-up (GL convention)
    this.x = .5; this.y = .5;
    this.sx = .5; this.sy = .5;   // smoothed
    this.dx = 0; this.dy = 0;     // velocity (units/sec)
    this.down = false;
    this.moved = false;           // has the user ever moved? (for hints)
    this.lastMoveT = 0;
    this._px = .5; this._py = .5;
    const set = (e) => {
      const t = e.touches ? e.touches[0] : e;
      if (!t) return;
      this.x = t.clientX / innerWidth;
      this.y = 1 - t.clientY / innerHeight;
      this.moved = true;
      this.lastMoveT = performance.now();
    };
    addEventListener('pointermove', set, { passive: true });
    addEventListener('pointerdown', e => { this.down = true; set(e); }, { passive: true });
    addEventListener('pointerup', () => { this.down = false; }, { passive: true });
    addEventListener('touchmove', set, { passive: true });
    addEventListener('blur', () => { this.down = false; });
  }
  update(dt) {
    this.sx = damp(this.sx, this.x, 10, dt);
    this.sy = damp(this.sy, this.y, 10, dt);
    this.dx = damp(this.dx, (this.sx - this._px) / Math.max(dt, 1e-4), 12, dt);
    this.dy = damp(this.dy, (this.sy - this._py) / Math.max(dt, 1e-4), 12, dt);
    this._px = this.sx; this._py = this.sy;
  }
  get speed() { return Math.hypot(this.dx, this.dy); }
}
