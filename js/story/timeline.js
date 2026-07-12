// The story, as numbers. Every scroll pixel maps to a narrative beat here —
// change the story by changing this file, never the renderer.

import { smoothstep } from '../engine/math.js';

export const RUNWAY_VH = 18;           // total scroll length, in viewports

// I Gates · II Touch · III Flight · IV Spark · V Craft · VI Worlds · VII Signature
export const ACT_STARTS = [0, 0.10, 0.22, 0.34, 0.50, 0.64, 0.84];

// DOM copy windows: [fadeInStart, fadeInEnd] / [fadeOutStart, fadeOutEnd]
export const BEATS = {
  limits:   { in: [0.004, 0.022], out: [0.052, 0.072] },
  void:     { in: [0.000, 0.000], out: [0.000, 0.001] },   // retired beat, kept for DOM safety
  drop:     { in: [0.048, 0.066], out: [0.085, 0.098] },
  touch1:   { in: [0.115, 0.135], out: [0.152, 0.166] },
  touch2:   { in: [0.160, 0.174], out: [0.184, 0.192] },   // gone before the spark: the gasp is wordless
  flight1:  { in: [0.238, 0.256], out: [0.278, 0.292] },
  flight2:  { in: [0.298, 0.312], out: [0.336, 0.348] },   // lands over the dark water, not the sun-road glare
  touch:    { in: [0.372, 0.392], out: [0.424, 0.442] },   // the visitor gets the brush first...
  spark:    { in: [0.440, 0.462], out: [0.480, 0.500] },   // ...then the studio may introduce itself
  craft1:   { in: [0.506, 0.526], out: [0.548, 0.563] },
  craft2:   { in: [0.566, 0.584], out: [0.606, 0.618] },
  craft3:   { in: [0.620, 0.636], out: [0.654, 0.666] },
  worlds:   { in: [0.660, 0.680], out: [0.706, 0.720] },
  worlds2:  { in: [0.748, 0.766], out: [0.802, 0.818] },   // voice between EDEN and AURORA
  converge: { in: [0.826, 0.842], out: [0.852, 0.866] },   // clear before stroke A ignites at 0.868
  sign:     { in: [0.918, 0.948], out: [1.5, 1.6] },     // stays for the bow
};

export function beatAlpha(p, b) {
  return smoothstep(b.in[0], b.in[1], p) * (1 - smoothstep(b.out[0], b.out[1], p));
}

// Particle typography: word planes the camera flies through.
// Window: assembles [a→b], holds, dissolves [c→d] just before the fly-through.
export const WORDS = [
  { text: 'WORLDS', z: 2.0,   win: [0.506, 0.542, 0.556, 0.582] },
  { text: 'MOTION', z: -4.5,  win: [0.574, 0.606, 0.620, 0.645] },
  { text: 'PLAY',   z: -12.0, win: [0.636, 0.668, 0.680, 0.702] },
];

// THE TOUCH — hand/orb/earth choreography (all as spans of p)
export const TOUCH = {
  on:    [0.095, 0.115, 0.225, 0.245],   // visibility window (in/in, out/out)
  reach: [0.115, 0.192],                 // the hand closes the gap
  earth: [0.112, 0.196],                 // the world GROWS as the hand closes — Earth from the first frame
  zoom:  [0.196, 0.238],                 // contact → being let in
};

// THE FLIGHT — blue-sky city window
export const FLIGHT = {
  on:   [0.215, 0.235, 0.325, 0.352],    // fade in / fade out
  span: [0.215, 0.352],                  // camera distance driver
};

export const PORTALS = [
  { world: 0, x: -2.5, y:  0.25, z: -14.5, ry:  0.42, cap: 'NEBULA · YOUR UNIVERSE',      edge: [1.0, 0.30, 0.50] },
  { world: 1, x:  2.5, y: -0.15, z: -18.5, ry: -0.42, cap: 'TIDE · YOUR LAUNCH FILM',     edge: [1.0, 0.68, 0.30] },
  { world: 2, x: -2.5, y:  0.05, z: -22.5, ry:  0.42, cap: 'EDEN · YOUR PLAYABLE STORY',  edge: [0.45, 0.95, 0.55] },
  { world: 3, x:  2.5, y:  0.20, z: -26.5, ry: -0.42, cap: 'AURORA · YOUR BRAND, LIVE',   edge: [0.55, 0.42, 1.00] },
];

// The mark: two brushstrokes in mark-space (y up), a V signed in light.
export const STROKE_A = [-0.34, 0.46, -0.22, 0.06, -0.10, -0.26, 0.0, -0.46];
export const STROKE_B = [0.0, -0.46, 0.10, -0.14, 0.22, 0.18, 0.34, 0.48];

// arc-length point along a 4-point polyline (flat array), t ∈ 0..1
export function strokePoint(pts, t) {
  const seg = [];
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const dx = pts[(i + 1) * 2] - pts[i * 2], dy = pts[(i + 1) * 2 + 1] - pts[i * 2 + 1];
    const l = Math.hypot(dx, dy); seg.push(l); total += l;
  }
  let d = t * total;
  for (let i = 0; i < 3; i++) {
    if (d <= seg[i] || i === 2) {
      const f = seg[i] > 0 ? Math.min(d / seg[i], 1) : 0;
      return [
        pts[i * 2] + (pts[(i + 1) * 2] - pts[i * 2]) * f,
        pts[i * 2 + 1] + (pts[(i + 1) * 2 + 1] - pts[i * 2 + 1]) * f,
      ];
    }
    d -= seg[i];
  }
  return [pts[6], pts[7]];
}

// pigment cycle — the studio's four inks
const INKS = [
  [1.0, 0.18, 0.39],   // rose
  [1.0, 0.70, 0.28],   // amber
  [0.49, 0.30, 1.0],   // violet
  [0.18, 0.90, 0.84],  // teal
];
export function pigment(t, spread = 1) {
  const x = ((t * 0.13) % 1 + 1) % 1 * 4;
  const i = Math.floor(x) % 4, f = x - Math.floor(x);
  const a = INKS[i], b = INKS[(i + 1) % 4];
  return [
    (a[0] + (b[0] - a[0]) * f) * spread,
    (a[1] + (b[1] - a[1]) * f) * spread,
    (a[2] + (b[2] - a[2]) * f) * spread,
  ];
}

// generic keyframe ramp: [[p, value], ...] — value may be number or [r,g,b]
export function ramp(p, keys) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [p0, v0] = keys[i - 1], [p1, v1] = keys[i];
      const t = (p - p0) / (p1 - p0);
      if (typeof v0 === 'number') return v0 + (v1 - v0) * t;
      return v0.map((c, k) => c + (v1[k] - c) * t);
    }
  }
  return keys[keys.length - 1][1];
}
