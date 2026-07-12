// Boot. Gate on capability, then hand the browser to the engine.
// Any failure — no WebGL2, no float targets, reduced motion, lost context —
// lands on the editorial story, which is a designed experience, not an apology.

import { initGL } from './engine/gl.js';
import { ScrollTimeline } from './engine/scroll.js';
import { Pointer } from './engine/pointer.js';
import { Quality } from './engine/quality.js';
import { Post } from './engine/post.js';
import { Fluid } from './sim/fluid.js';
import { Particles } from './sim/particles.js';
import { Director } from './story/director.js';
import { RUNWAY_VH } from './story/timeline.js';
import { Score } from './audio/score.js';
import { HUD } from './ui/hud.js';

const q = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('rm');

if (!reducedMotion) safeBoot();

function safeBoot() {
  try { boot(); }
  catch (err) {
    console.error('[vividcanvas] engine failed, staying editorial:', err);
    document.documentElement.classList.remove('gl');
  }
}

function boot() {
  const canvas = document.getElementById('stage');
  const ctx = initGL(canvas);
  if (!ctx) return;                     // editorial mode stands
  const { gl, screenVAO } = ctx;

  const forced = q.has('tier') ? Math.max(0, Math.min(3, +q.get('tier') || 0)) : null;
  const quality = new Quality(forced);
  const scroll = new ScrollTimeline(document.getElementById('runway'), RUNWAY_VH);
  const pointer = new Pointer();
  const post = new Post(gl, screenVAO);
  const fluid = new Fluid(gl, screenVAO, quality.tier);
  const particles = new Particles(gl, screenVAO, quality.tier);
  const score = new Score();
  const hud = new HUD(scroll, score);
  const director = new Director({
    gl, screenVAO, canvas, fluid, particles, post, scroll, pointer, quality, hud, score,
  });

  // Layout metrics can be 0 at boot (prerender, embedded panes) — start on a
  // sane default and self-heal from real canvas layout inside the frame loop.
  let cw = 0, ch = 0, lastCssW = 0, lastCssH = 0;
  function cssSize() {
    const w = canvas.clientWidth || innerWidth || document.documentElement.clientWidth || 1280;
    const h = canvas.clientHeight || innerHeight || document.documentElement.clientHeight || 720;
    return [w, h];
  }
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, quality.tier.dpr);
    [lastCssW, lastCssH] = cssSize();
    cw = Math.max(2, Math.round(lastCssW * dpr));
    ch = Math.max(2, Math.round(lastCssH * dpr));
    // only rebuild render targets when the size truly changed (resize events
    // fire liberally on mobile browser-chrome show/hide)
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch;
      post.allocate(cw, ch, quality.tier.bloomMips);
    } else if (!post.scene || post.mips !== quality.tier.bloomMips) {
      post.allocate(cw, ch, quality.tier.bloomMips);
    }
  }
  resize();

  let resizeTimer = 0, lastAspect = innerWidth / innerHeight;
  addEventListener('resize', () => {
    resize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const a = innerWidth / innerHeight;
      if (Math.abs(a - lastAspect) / lastAspect > 0.12) {
        lastAspect = a;
        fluid.allocate(quality.tier);   // dye field follows the new frame
      }
    }, 280);
  }, { passive: true });

  quality.onchange = () => {
    fluid.allocate(quality.tier);
    particles.allocate(quality.tier);
    resize();
  };

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    console.warn('[vividcanvas] context lost — falling back to editorial');
    document.documentElement.classList.remove('gl');
  });

  // engine is compiled and alive — swap the page into GL mode
  document.documentElement.classList.add('gl');
  director.init(); // async: fonts → in-world type & glyph targets

  // debug: ?p=0.42 jump · ?fps overlay · ?tier=N lock
  if (q.has('p')) {
    const target = parseFloat(q.get('p')) || 0;
    let tries = 0;
    const kick = () => {
      scroll.resize();
      if (scroll.max > 1 || tries++ > 90) scroll.scrollToProgress(target, false);
      else requestAnimationFrame(kick);
    };
    requestAnimationFrame(kick);
  }
  let fpsEl = null, fpsAcc = 0, fpsN = 0;
  if (q.has('fps')) {
    // debug handle for engine forensics
    window.__vc = { gl, canvas, director, fluid, particles, post, scroll, pointer, quality };
    fpsEl = document.createElement('div');
    fpsEl.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:99;font:12px monospace;color:#8f8;background:#000a;padding:4px 8px;border-radius:4px';
    document.body.appendChild(fpsEl);
  }

  let last = performance.now(), sizePoll = 0;
  function tick(dtMs) {
    const dt = Math.min(dtMs / 1000, 0.05);
    if (++sizePoll >= 20) {           // layout self-heal (some hosts never fire resize)
      sizePoll = 0;
      const [w, h] = cssSize();
      if (Math.abs(w - lastCssW) > 2 || Math.abs(h - lastCssH) > 2) resize();
    }
    scroll.update(dt);
    pointer.update(dt);
    director.frame(dt, cw, ch);
    score.update(scroll.velocity);
  }
  if (window.__vc) {
    // deterministic frame driver for QA in rAF-throttled hosts
    window.__vc.step = (n = 1, dtMs = 16.6) => { for (let i = 0; i < n; i++) tick(dtMs); };
  }
  function frame(now) {
    const dtMs = now - last; last = now;
    if (quality.sample(dtMs)) { /* onchange already rebuilt */ }
    tick(dtMs);
    if (fpsEl) {
      fpsAcc += dtMs; fpsN++;
      if (fpsAcc > 500) {
        fpsEl.textContent = `${Math.round(1000 / (fpsAcc / fpsN))}fps · tier ${quality.level} (${quality.tier.name}) · p ${scroll.progress.toFixed(3)}`;
        fpsAcc = 0; fpsN = 0;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
