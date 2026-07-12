# VIVIDCANVAS — The Living Canvas

A five-act, scroll-driven real-time experience for **vividcanvas.tv**. Not a page — a
playable film: a drop of light falls onto black linen, ignites into living pigment,
condenses into typography, opens portals into four worlds, and signs itself as the
VividCanvas mark.

Built as a **zero-dependency custom WebGL2 engine**. No frameworks, no build step,
no runtime network requests (fonts self-hosted). The site is the portfolio; the code
is the proof.

## Run

Any static file server works. For development (caching disabled):

```bash
python3 serve.py 4519       # → http://localhost:4519
```

Deploy by uploading the folder to any static host (Netlify / Vercel / Cloudflare
Pages / S3). There is nothing to build.

## The five acts

| Act | Scroll | What happens |
|-----|--------|--------------|
| I · The Gates | 0 – 0.10 | Monumental doors among galaxies/supernovae; "IMAGINATION HAS NO LIMITS"; doors part onto a paradise vortex; threshold crossing |
| II · The Touch | 0.10 – 0.22 | A nebula-filled celestial hand (pointer-led) reaches for a light that becomes Earth; spark of contact → infinite zoom in |
| III · The Flight | 0.22 – 0.34 | First-person golden-hour city flythrough (raymarched, half-res): canyon → dive → rooftops → coastline → open-water sunset; your fists lead the frame |
| IV · The Spark | 0.34 – 0.50 | Dusk detonates into the GPU fluid simulation — living pigment; the cursor is a brush |
| V · The Craft | 0.50 – 0.64 | 262k particles assemble WORLDS / MOTION / PLAY over a galaxy field |
| VI · The Worlds | 0.64 – 0.86 | Portal canvases — Nebula, Tide, Eden (tropical paradise), Aurora |
| VII · The Signature | 0.84 – 1.0 | Two brushstrokes paint the V mark; particles feed the wet tip; wordmark + signed CTA |

**The Loop:** `VISION.md` is the north star; `LOOP.md` is a self-contained agentic
refinement cycle (run with `/loop`); `LOOP-LOG.md` tracks convergence scores.

## Architecture

```
index.html               instant-paint shell + full semantic story (a11y/SEO/fallback)
css/main.css             chrome, copy beats, editorial mode
js/main.js               boot, capability gate, frame loop, adaptive rebuilds
js/engine/
  gl.js                  WebGL2 context, Program (cached uniforms), textures, FBOs
  math.js                mat4/easing/damping — everything hand-rolled
  scroll.js              native scroll → critically-damped master timeline
  pointer.js             smoothed pointer + velocity (the brush)
  quality.js             GPU tier table + adaptive governor (steps down on jank)
  post.js                HDR scene → mip-chain bloom → ACES/grain/vignette/CA
  text.js                canvas-rasterized type → GL textures + particle glyph targets
js/sim/
  fluid.js               Stam-style stable fluids (vorticity confinement, HDR dye)
  particles.js           262k GPU particles, MRT sim, gl_VertexID rendering
js/story/
  timeline.js            THE STORY AS DATA — every beat, window, palette
  director.js            per-frame orchestration: camera, layers, uniforms, cues
js/shaders/              all GLSL (template strings): fluid, particles, worlds, post
js/audio/score.js        generative WebAudio score (opt-in, no assets)
js/ui/hud.js             act rail, sound toggle, hints, CTA
```

**Change the story by editing `js/story/timeline.js`** — acts, beat windows, words,
portals, palettes and the mark's stroke geometry all live there as data.

## Performance

- Quality tiers (`ember → flame → blaze → nova`) scale DPR, fluid resolution,
  Jacobi iterations, particle count, bloom depth, and effects.
- A governor watches real frame times: sustained > 24 ms steps a tier down,
  sustained headroom climbs back up (never past the hardware guess).
- All simulation work is fixed-cost per frame; there are no per-frame allocations
  in the hot loop, and reallocation (resize/tier) disposes old GPU resources.

## Accessibility

- Full story exists as semantic HTML in `#story` — it *is* the screen-reader path.
- `prefers-reduced-motion` (or no WebGL2 / no float render targets / context loss)
  serves the editorial experience — designed, still branded, zero motion.
- Native scroll is never hijacked: keyboard, scrollbar, and touch all work.
- The act rail is keyboard-focusable; contact is always one click/tab away.

## Debug flags

`?fps` — overlay + `window.__vc` engine handle (with `__vc.step(n)` deterministic driver)
`?p=0.42` — jump to a story position · `?tier=0..3` — lock a quality tier ·
`?rm=1` — force the reduced-motion editorial experience

## Notes

- Contact email is `hello@vividcanvas.tv` throughout — change in `index.html` (two places) if needed.
- `assets/og.jpg` was rendered by the engine itself (the finale frame).
