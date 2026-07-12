// Adaptive quality governor. Performance is part of the art: pick a starting
// tier from hardware hints, then watch real frame times and step down/up.
// Every knob the renderer owns lives in the tier table.

export const TIERS = [
  { // 0 — floor (old phones)
    name: 'ember', dpr: 1.0, dyeRes: 256, velRes: 96, jacobi: 8,
    particlesW: 128, particlesH: 128, bloomMips: 4, rays: false, aberration: false, citySteps: 36,
  },
  { // 1 — mobile
    name: 'flame', dpr: 1.25, dyeRes: 384, velRes: 128, jacobi: 12,
    particlesW: 256, particlesH: 256, bloomMips: 5, rays: true, aberration: false, citySteps: 56,
  },
  { // 2 — laptop
    name: 'blaze', dpr: 1.5, dyeRes: 512, velRes: 192, jacobi: 18,
    particlesW: 512, particlesH: 256, bloomMips: 6, rays: true, aberration: true, citySteps: 88,
  },
  { // 3 — desktop GPU
    name: 'nova', dpr: 2.0, dyeRes: 1024, velRes: 256, jacobi: 24,
    particlesW: 512, particlesH: 512, bloomMips: 6, rays: true, aberration: true, citySteps: 128,
  },
];

export class Quality {
  constructor(forcedTier = null) {
    this.level = forcedTier ?? guessTier();
    this.locked = forcedTier !== null;
    this._acc = 0; this._n = 0; this._cool = 0; this._warm = 0;
    this.onchange = null;
  }
  get tier() { return TIERS[this.level]; }
  // Feed real frame times; returns true when the tier changed (renderer must rebuild).
  sample(dtMs) {
    if (this.locked) return false;
    if (dtMs > 250) return false;                 // tab-switch stall, not a real frame
    this._acc += dtMs; this._n++;
    if (this._n < 45) return false;               // judge ~3/4s windows
    const avg = this._acc / this._n;
    this._acc = 0; this._n = 0;
    if (this._cool > 0) { this._cool--; return false; }   // settle after a change
    if (avg > 24 && this.level > 0) {             // sustained < ~42fps → step down
      this.level--; this._warm = 0; this._cool = 1;
      this.onchange?.(this.level);
      return true;
    }
    if (avg < 12.5 && this.level < guessTier()) { // headroom → climb back (never past guess)
      if (++this._warm >= 6) {                    // ~5s of proof first
        this.level++; this._warm = 0; this._cool = 1;
        this.onchange?.(this.level);
        return true;
      }
    } else this._warm = 0;
    return false;
  }
}

function guessTier() {
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 2 && innerWidth < 1024);
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return mem >= 4 && cores >= 6 ? 1 : 0;
  if (mem >= 8 && cores >= 8) return 3;
  return 2;
}
