// Minimal math kit — only what the engine actually uses. Column-major mat4 (GL convention).

export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const lerp = (a, b, t) => a + (b - a) * t;
export const saturate = x => clamp(x, 0, 1);

// Smooth window: 0 before a, eases 1 between a..b, eases back 0 c..d.
export function window4(x, a, b, c, d) {
  return smoothstep(a, b, x) * (1 - smoothstep(c, d, x));
}
export function smoothstep(a, b, x) {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
// Map x from [a,b] to [0,1], clamped.
export const span = (x, a, b) => saturate((x - a) / (b - a));

/* eases */
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
export const easeInQuad = t => t * t;

/* frame-rate independent damping: returns new current value */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/* ---------- mat4 ---------- */
export function mat4Identity(out = new Float32Array(16)) {
  out.fill(0); out[0] = out[5] = out[10] = out[15] = 1; return out;
}
export function mat4Perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) * nf; out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}
export function mat4Multiply(out, a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  out.set(o); return out;
}
export function mat4LookAt(out, eye, center, up = [0, 1, 0]) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

/* deterministic hash for stagger patterns */
export function hash1(n) {
  n = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}
