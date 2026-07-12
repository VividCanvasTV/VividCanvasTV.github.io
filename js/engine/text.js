// Type that lives inside the world. Two outputs from the same 2D-canvas
// rasterizer: crisp alpha textures for quads, and glyph point-clouds that
// particles adopt as targets.

import { createTexture } from './gl.js';

const measureCanvas = document.createElement('canvas');

function raster(text, { px = 160, font = 'Archivo', weight = 600, italic = false, tracking = 0, stretch = 'normal' } = {}) {
  const ctx = measureCanvas.getContext('2d', { willReadFrequently: true });
  const fontStr = `${italic ? 'italic ' : ''}${weight} ${px}px ${font}`;
  ctx.font = fontStr;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking * px}px`;
  if ('fontStretch' in ctx) ctx.fontStretch = stretch;
  const m = ctx.measureText(text);
  const w = Math.ceil(m.width + px * 0.2);
  const h = Math.ceil(px * 1.35);
  measureCanvas.width = w; measureCanvas.height = h;
  const c2 = measureCanvas.getContext('2d', { willReadFrequently: true });
  c2.clearRect(0, 0, w, h);
  c2.font = fontStr;
  if ('letterSpacing' in c2) c2.letterSpacing = `${tracking * px}px`;
  if ('fontStretch' in c2) c2.fontStretch = stretch;
  c2.fillStyle = '#fff';
  c2.textBaseline = 'middle';
  c2.fillText(text, px * 0.1, h * 0.54);
  return { canvas: measureCanvas, w, h };
}

// GPU texture of the rendered text (alpha channel is what matters)
export function makeTextTexture(gl, text, opts) {
  const { canvas, w, h } = raster(text, opts);
  const tex = createTexture(gl, w, h, {
    internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR,
  });
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  return { tex, aspect: w / h };
}

// Particle targets: Float32Array(count*4) — xyz world position + has-target flag.
// `share` = fraction of the population conscripted into the glyphs.
export function makeGlyphTargets(text, count, { center = [0, 0, 0], width = 6, share = 0.8, jitter = 0.012, ...opts } = {}) {
  const { canvas, w, h } = raster(text, { px: 220, weight: 800, stretch: 'expanded', tracking: 0.06, ...opts });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h).data;
  const pts = [];
  const step = 2; // sample every other pixel — plenty of density
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (img[(y * w + x) * 4 + 3] > 100) pts.push(x, y);
    }
  }
  const data = new Float32Array(count * 4);
  if (!pts.length) return data;
  const scale = width / w;
  const n = pts.length / 2;
  const claimed = Math.floor(count * share);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    if (i >= claimed) { data[o + 3] = 0; continue; }
    const k = (Math.floor(Math.random() * n)) * 2;
    data[o + 0] = center[0] + (pts[k] - w / 2) * scale + (Math.random() - 0.5) * jitter;
    data[o + 1] = center[1] + (h / 2 - pts[k + 1]) * scale + (Math.random() - 0.5) * jitter;
    data[o + 2] = center[2] + (Math.random() - 0.5) * jitter * 8;
    data[o + 3] = 1;
  }
  return data;
}
