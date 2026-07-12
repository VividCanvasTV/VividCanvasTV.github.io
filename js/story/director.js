// The Director. Owns the camera, the draw order, and every act's parameters.
// Reads: smoothed scroll progress, pointer, clock. Writes: uniforms, splats,
// forces, DOM beat opacities, audio cues. One continuous take, no cuts.

import { Program, blit } from '../engine/gl.js';
import {
  mat4Identity, mat4Perspective, mat4LookAt, mat4Multiply,
  clamp, lerp, span, window4, smoothstep, easeInQuad,
} from '../engine/math.js';
import { SCREEN_VS, NOISE } from '../shaders/common.js';
import { WORLD } from '../shaders/world.js';
import { makeTextTexture, makeGlyphTargets } from '../engine/text.js';
import {
  BEATS, beatAlpha, WORDS, PORTALS, STROKE_A, STROKE_B,
  strokePoint, pigment, ramp, ACT_STARTS, TOUCH, FLIGHT,
} from './timeline.js';

const FOV = 55 * Math.PI / 180;

export class Director {
  constructor(env) {
    Object.assign(this, env); // gl, screenVAO, canvas, fluid, particles, post, scroll, pointer, quality, hud, score
    const gl = this.gl;
    this.progs = {
      void: new Program(gl, SCREEN_VS, NOISE + WORLD.voidFS, 'world.void'),
      touch: new Program(gl, SCREEN_VS, NOISE + WORLD.touchFS, 'world.touch'),
      city: new Program(gl, SCREEN_VS, NOISE + WORLD.cityFS, 'world.city'),
      beams: new Program(gl, SCREEN_VS, NOISE + WORLD.beamsFS, 'world.beams'),
      portal: new Program(gl, WORLD.portalVS, NOISE + WORLD.portalFS, 'world.portal'),
      mark: new Program(gl, SCREEN_VS, NOISE + WORLD.markFS, 'world.mark'),
      text: new Program(gl, WORLD.textVS, NOISE + WORLD.textFS, 'world.text'),
      blitTex: new Program(gl, SCREEN_VS,
        `in vec2 v_uv;\nuniform sampler2D u_tex;\nout vec4 o;\nvoid main(){ o = texture(u_tex, v_uv); }`,
        'world.blitTex'),
    };
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.viewProj = new Float32Array(16);
    this.identity = mat4Identity();
    this.model = new Float32Array(16);
    this.time = 0;
    this.bootT = 0;
    this.impactCool = 0;
    this.lastAct = -1;
    this.lastAssembled = -1;
    this.emitterPhase = Math.random() * 100;
    this.texts = null;      // built async once fonts land
    this._beatState = {};
  }

  async init() {
    try {
      await Promise.all([
        document.fonts.load('800 220px Archivo'),
        document.fonts.load('700 160px Archivo'),
        document.fonts.load('600 160px Archivo'),
      ]);
    } catch { /* fallback glyphs are fine */ }
    const gl = this.gl;
    this.texts = {
      wordmark: makeTextTexture(gl, 'VIVIDCANVAS', { px: 200, weight: 700, tracking: 0.30, stretch: 'expanded' }),
      captions: PORTALS.map(pt => makeTextTexture(gl, pt.cap, { px: 96, weight: 600, tracking: 0.24 })),
    };
  }

  /* ------------------------------------------------ camera ---- */
  updateCamera(p, cw, ch) {
    const pt = this.pointer;
    const flight = window4(p, 0.51, 0.60, 0.80, 0.90);
    const camZ =
      p < 0.50 ? 10 :
      p < 0.86 ? 10 - span(p, 0.50, 0.86) * 38 :
      -28 - span(p, 0.86, 1) * 4;
    const camX = Math.sin(p * 21.0) * 0.55 * flight + (pt.sx - 0.5) * 0.55;
    const camY = Math.cos(p * 15.0) * 0.32 * flight + (pt.sy - 0.5) * 0.38;
    const eye = [camX, camY, camZ];
    const target = [camX * 0.35, camY * 0.35, camZ - 6];
    mat4Perspective(this.proj, FOV, cw / ch, 0.1, 100);
    mat4LookAt(this.view, eye, target);
    mat4Multiply(this.viewProj, this.proj, this.view);
    this.cam = { x: camX, y: camY, z: camZ };
  }

  // pointer ray → world point on the plane `dist` ahead of the camera
  pointerWorld(dist, cw, ch) {
    const ty = Math.tan(FOV / 2);
    return [
      this.cam.x + (this.pointer.sx * 2 - 1) * ty * (cw / ch) * dist,
      this.cam.y + (this.pointer.sy * 2 - 1) * ty * dist,
      this.cam.z - dist,
    ];
  }

  /* -------------------------------------------------- frame ---- */
  frame(dt, cw, ch) {
    const gl = this.gl, vao = this.screenVAO;
    this.time += dt;
    this.bootT += dt;
    this.impactCool = Math.max(0, this.impactCool - dt);
    const p = this.scroll.progress;
    const vel = this.scroll.velocity;
    const pt = this.pointer;

    this.updateCamera(p, cw, ch);
    this.directFluid(p, dt);
    this.directParticles(p, dt, cw, ch);

    /* ---- build the HDR scene ---- */
    const scene = this.post.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
    gl.viewport(0, 0, scene.w, scene.h);
    gl.disable(gl.BLEND);

    // 1 · the cosmos — galaxies, supernovae, and (Act I) the Gates
    const impact = Math.max(
      window4(p, 0.096, 0.104, 0.110, 0.134),   // threshold crossing — sharp, then let the dream breathe
      window4(p, 0.338, 0.346, 0.370, 0.425),   // the city ignites into paint
    );
    const approach = span(p, 0.0, 0.10);
    this.progs.void.use()
      .set('u_res', scene.w, scene.h).set('u_time', this.time)
      .set('u_impact', impact)
      .set('u_gateOn', (1 - span(p, 0.097, 0.112)) * span(this.bootT, 0.1, 1.2))
      .set('u_gate', smoothstep(0.012, 0.094, p))
      .set('u_zoom', 1 + Math.pow(approach, 2.1) * 6.0 * (1 - smoothstep(0.10, 0.16, p)))
      .set('u_cosmic', ramp(p, [[0, 0.9], [0.10, 0.35], [0.13, 0.28], [0.21, 0.22], [0.24, 0], [0.335, 0], [0.36, 0.2], [0.50, 0.5], [0.66, 0.75], [0.86, 0.3], [0.96, 0.12]]))
      .set('u_detail', this.quality.tier.rays ? 1 : 0)
      .set('u_calm', ramp(p, [[0, 0.40], [0.055, 0.40], [0.09, 1]]))
      .set('u_weave', ramp(p, [[0, 0], [0.84, 0], [0.90, 0.22], [0.97, 0.42]]))
      .set('u_base', ramp(p, [[0, 0.04], [0.10, 0.06], [0.34, 0.05], [0.6, 0.03], [0.9, 0.05]]))
      .set('u_pointer', pt.sx, pt.sy);
    blit(gl, vao, scene);

    // 1b · THE TOUCH — the hand, the light, the world
    const touchOn = window4(p, TOUCH.on[0], TOUCH.on[1], TOUCH.on[2], TOUCH.on[3]);
    if (touchOn > 0.004) {
      // the hand leans toward the visitor's pointer, but Earth always wins
      const aspect = cw / ch;
      const ptAsp = [(pt.sx - 0.5) * aspect, pt.sy - 0.5];
      let offX = (ptAsp[0] - 0.24) * 0.30, offY = (ptAsp[1] - 0.05) * 0.30;
      const offLen = Math.hypot(offX, offY);
      if (offLen > 0.09) { offX *= 0.09 / offLen; offY *= 0.09 / offLen; }
      this.handOff = [offX, offY];
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.progs.touch.use()
        .set('u_res', scene.w, scene.h).set('u_time', this.time)
        .set('u_on', touchOn)
        .set('u_reach', span(p, TOUCH.reach[0], TOUCH.reach[1]))
        .set('u_earth', span(p, TOUCH.earth[0], TOUCH.earth[1]))
        .set('u_zoomIn', span(p, TOUCH.zoom[0], TOUCH.zoom[1]))
        .set('u_handOff', offX, offY)
        .set('u_energy', clamp(pt.speed * 9, 0, 1));
      blit(gl, vao, scene);
      gl.disable(gl.BLEND);
    }

    // 1c · THE FLIGHT — blue sky, real towers, any idea airborne.
    // Raymarched at HALF resolution then upscaled: 4× cheaper, aerial content
    // doesn't miss the pixels.
    const flightOn = window4(p, FLIGHT.on[0], FLIGHT.on[1], FLIGHT.on[2], FLIGHT.on[3]);
    if (flightOn > 0.004) {
      const half = this.post.half;
      gl.disable(gl.BLEND);
      this.progs.city.use()
        .set('u_res', half.w, half.h).set('u_time', this.time)
        .set('u_on', flightOn)
        .set('u_fly', span(p, FLIGHT.span[0], FLIGHT.span[1]))
        .set('u_dusk', span(p, 0.315, 0.348))
        .set('u_steps', this.quality.tier.citySteps)
        .set('u_pointer', pt.sx, pt.sy);
      blit(gl, vao, half);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.progs.blitTex.use().bindTex('u_tex', 0, half.tex);
      blit(gl, vao, scene);
      gl.disable(gl.BLEND);
    }

    // 2 · pigment
    const fluidVis = ramp(p, [[0, 0], [0.334, 0], [0.352, 0.9], [0.38, 1], [0.50, 1], [0.56, 0.3], [0.62, 0.2], [0.70, 0], [0.83, 0], [0.9, 0.35], [1, 0.4]]);
    if (fluidVis > 0.004) {
      const zoom = ramp(p, [[0, 1], [0.50, 1], [0.62, 1.75], [0.70, 2.1], [0.83, 1.3], [1, 1.25]]);
      this.fluid.display(scene, cw, ch, fluidVis, zoom, 0, ramp(p, [[0.50, 0], [0.62, -0.06], [1, -0.06]]));
    }

    // 3 · volumetric beams (the Craft's excavation light)
    const beamI = window4(p, 0.50, 0.57, 0.64, 0.70);
    if (beamI > 0.004 && this.quality.tier.rays) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      this.progs.beams.use()
        .set('u_res', scene.w, scene.h).set('u_time', this.time)
        .set('u_intensity', beamI).set('u_tint', 0.16, 0.42, 0.46);
      blit(gl, vao, scene);
      gl.disable(gl.BLEND);
    }

    // 4 · portals + captions
    this.drawPortals(p, scene, cw, ch);

    // 5 · particles — over everything, additive sparks
    const partU = this._particleRenderU(p, cw, ch);
    if (partU.opacity > 0.004) this.particles.render(scene, cw, ch, partU);

    // 6 · the mark + wordmark
    this.drawSignature(p, scene, cw, ch);

    /* ---- post + DOM ---- */
    this.post.composite(cw, ch, {
      time: this.time,
      threshold: ramp(p, [[0, 0.9], [0.24, 0.95], [0.30, 1.15], [0.36, 1.0], [0.50, 0.85], [1, 0.85]]),
      bloom: ramp(p, [[0, 1.0], [0.10, 1.1], [0.24, 0.55], [0.32, 0.55], [0.38, 1.0], [0.50, 0.85], [0.86, 1.05], [1, 0.95]]),
      grain: clamp(0.030 + Math.abs(vel) * 0.07, 0, 0.08) * ramp(p, [[0.22, 1], [0.26, 0.5], [0.33, 0.5], [0.37, 1]]),
      vignette: ramp(p, [[0, 0.74], [0.10, 0.58], [0.24, 0.30], [0.33, 0.35], [0.38, 0.48], [0.64, 0.52], [1, 0.60]]),
      ca: this.quality.tier.aberration
        ? clamp(Math.abs(vel) * 2.0, 0, 1) * 1.1 + window4(p, 0.66, 0.72, 0.80, 0.86) * 0.22 + impact * 0.9
          + window4(p, TOUCH.zoom[0], TOUCH.zoom[1], TOUCH.zoom[1] + 0.01, TOUCH.zoom[1] + 0.03) * 1.6
        : 0,
      fade: smoothstep(0, 1.4, this.bootT),
    });

    this.updateDOM(p);
    this.emitCues(p);
  }

  /* -------------------------------------------------- fluid ---- */
  directFluid(p, dt) {
    const f = this.fluid, t = this.time;
    const fluidActive = (p > 0.33 && p < 0.74) || p > 0.82;
    if (!fluidActive) return;

    // ignition: the city's dusk detonates into pigment
    if (p > 0.338 && p < 0.42 && this.impactCool <= 0 && this.scroll.velocity > 0) {
      this.impactCool = 2.5;
      const cx = 0.5, cy = 0.46;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
        const c = pigment(t + i * 2.1, 0.9);
        f.splat(cx, cy, Math.cos(a) * 420, Math.sin(a) * 420, c[0], c[1], c[2], 0.0022);
      }
      f.splat(cx, cy, 0, 0, 1.4, 1.15, 0.95, 0.0032);
      this.score?.boom();
    }

    // continuous emitters inject *rates*, not per-frame amounts
    const k = clamp(dt * 60, 0.6, 3);

    // Spark-act breathing emitters — alive even when the hand is still
    const breath = window4(p, 0.34, 0.39, 0.55, 0.64);
    if (breath > 0.02) {
      for (let e = 0; e < 2; e++) {
        const ph = this.emitterPhase + t * (0.42 + e * 0.13) + e * Math.PI;
        const r = 0.14 + 0.10 * Math.sin(t * 0.5 + e * 3.0);
        const x = 0.5 + Math.cos(ph) * r * 1.15, y = 0.47 + Math.sin(ph) * r;
        const c = pigment(t * 1.7 + e * 13.0, 0.055 * breath * k);
        f.splat(x, y, -Math.sin(ph) * 180 * breath, Math.cos(ph) * 180 * breath, c[0], c[1], c[2], 0.0014);
      }
    }

    // Act V — slow warm undertow beneath the signature
    const under = window4(p, 0.84, 0.9, 1.5, 1.6);
    if (under > 0.02) {
      const ph = t * 0.13;
      const c = lerp(0, 1, 0.5 + 0.5 * Math.sin(t * 0.4));
      f.splat(0.5 + Math.cos(ph) * 0.3, 0.4 + Math.sin(ph) * 0.14,
        -Math.sin(ph) * 60 * under, Math.cos(ph) * 60 * under,
        (0.06 * under + 0.02 * c * under) * k, 0.02 * under * k, 0.013 * under * k, 0.0026);
    }

    // the hand is a brush
    const pt = this.pointer;
    if (pt.moved && pt.speed > 0.015) {
      const c = pigment(t * 2.3 + pt.sx * 4.0, clamp(pt.speed * 4.5, 0.12, 0.7) * k);
      f.splat(pt.sx, pt.sy, pt.dx * 220, pt.dy * 220, c[0], c[1], c[2], 0.0016);
    }

    f.step(Math.min(dt, 1 / 40));
  }

  /* ---------------------------------------------- particles ---- */
  directParticles(p, dt, cw, ch) {
    const pr = this.particles;

    // which word owns the swarm?
    let assemble = 0;
    for (const w of WORDS) {
      const a = window4(p, w.win[0], w.win[1], w.win[2], w.win[3]);
      if (a > assemble) {
        assemble = a;
        if (a > 0.01) {
          // quantize so live resizes can't mint near-duplicate 4MB target sets
          const width = Math.min(7.0, Math.round(4.6 * (cw / ch) * 2) / 2);
          pr.setTargets(`${w.text}@${width.toFixed(1)}`, () => makeGlyphTargets(w.text, pr.count, {
            center: [0, 0.15, w.z], width, share: 0.45,
          }));
        }
      }
    }
    if (assemble <= 0.01) pr.setTargets(null);
    this.assembleNow = assemble;

    // The Touch keeps its dust free-drifting — the hand carries its own
    // starlight; any attractor here reads as a distracting ring of light.
    let attract = [0, 0, 0, 0], swirl = 1.6, orbitR = 0;

    // The Signature: the stroke tip devours the swarm
    const conv = window4(p, 0.845, 0.875, 0.965, 1.01);
    if (conv > 0.01) {
      const progA = span(p, 0.868, 0.928), progB = span(p, 0.920, 0.968);
      const tip = progB > 0 && progB < 1 ? strokePoint(STROKE_B, progB)
        : strokePoint(STROKE_A, clamp(progA, 0, 1));
      attract = [
        this.cam.x + tip[0] * 3.2,
        this.cam.y + tip[1] * 3.2,
        this.cam.z - 6,
        conv * 2.4,
      ];
    }

    pr.step(dt, {
      time: this.time,
      assemble,
      stagger: 0.7,
      drift: ramp(p, [[0, 0.30], [0.12, 0.45], [0.34, 0.55], [0.50, 0.42], [0.66, 0.5], [0.86, 0.35], [1, 0.25]]),
      pointer: this.pointerWorld(6, cw, ch),
      pointerVel: [this.pointer.dx * 5, this.pointer.dy * 5, 0],
      pointerStr: ramp(p, [[0, 0.4], [0.50, 1.2], [0.66, 0.8], [1, 0.6]]),
      attract,
      swirl,
      orbitR,
      home: [this.cam.x, this.cam.y, this.cam.z - 9],
      containR: 13,
    });
  }

  _particleRenderU(p, cw, ch) {
    return {
      viewProj: this.viewProj,
      time: this.time,
      size: ch * this.quality.tier.dpr * 0.0105 *
        ramp(p, [[0, 0.55], [0.50, 1.0], [0.66, 0.8], [0.86, 1.0], [1, 0.85]]),
      colA: ramp(p, [[0.44, [1.0, 0.72, 0.45]], [0.54, [0.20, 0.92, 0.86]], [0.66, [1.0, 0.55, 0.30]], [0.74, [1.0, 0.55, 0.30]], [0.88, [1.0, 0.25, 0.42]]]),
      colB: ramp(p, [[0.44, [1.0, 0.40, 0.55]], [0.54, [0.55, 0.42, 1.0]], [0.66, [0.55, 0.42, 1.0]], [0.74, [0.5, 0.35, 0.9]], [0.88, [1.0, 0.72, 0.34]]]),
      // fully off behind the opaque city (skips the 262k-point draw), alive everywhere else
      opacity: ramp(p, [[0, 0.16], [0.10, 0.22], [0.13, 0.24], [0.20, 0.22], [0.24, 0.0], [0.33, 0.0], [0.37, 0.55], [0.50, 0.6], [0.66, 0.34], [0.78, 0.4], [0.87, 0.8], [1, 0.55]]),
    };
  }

  /* ------------------------------------------------ portals ---- */
  drawPortals(p, scene, cw, ch) {
    if (p < 0.62 || p > 0.92 || !this.texts) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const pt = this.pointer;
    // the alley narrows with the viewport so frames never live off-screen
    const aspectK = clamp((cw / ch) / 1.6, 0.58, 1.1);

    // painter's order: farthest first, or near frames get buried
    this._portalsSorted ??= [...PORTALS].sort((a, b) => a.z - b.z);   // timeline data is immutable
    for (const port of this._portalsSorted) {
      const dist = this.cam.z - port.z;
      if (dist < 0.4 || dist > 26) continue;
      const fog = smoothstep(13, 23, dist) + smoothstep(2.2, 0.4, dist);
      if (fog >= 1) continue;
      const reveal = smoothstep(16, 9.5, dist);
      const ry = port.ry + (pt.sx - 0.5) * 0.10;
      const rx = (pt.sy - 0.5) * -0.07;
      const W = 3.3 * (0.72 + 0.28 * aspectK), H = W / 1.467;
      const px = port.x * aspectK;

      composeModel(this.model, px, port.y + Math.sin(this.time * 0.5 + port.z) * 0.05, port.z, ry, rx, W, H);
      this.progs.portal.use()
        .set('u_viewProj', this.viewProj).set('u_model', this.model)
        .set('u_camPos', this.cam.x, this.cam.y, this.cam.z)
        .set('u_time', this.time).set('u_world', port.world)
        .set('u_fog', clamp(fog, 0, 1)).set('u_reveal', reveal)
        .set('u_edgeCol', ...port.edge).set('u_aspect', W / H);
      gl.bindVertexArray(this.particles.emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // caption — small type floating beneath the frame
      const capTex = this.texts.captions[port.world];
      const capW = 1.9 * (0.72 + 0.28 * aspectK), capH = capW / capTex.aspect;
      composeModel(this.model, px, port.y - H / 2 - 0.40, port.z, ry * 0.7, 0, capW, capH);
      this.progs.text.use()
        .set('u_viewProj', this.viewProj).set('u_model', this.model)
        .bindTex('u_tex', 0, capTex.tex)
        .set('u_color', 1.15, 1.1, 1.0)
        .set('u_opacity', (1 - clamp(fog, 0, 1)) * 0.9)
        .set('u_reveal', reveal).set('u_time', this.time);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }
    gl.disable(gl.BLEND);
  }

  /* -------------------------------------------- act V finale ---- */
  drawSignature(p, scene, cw, ch) {
    const progA = span(p, 0.868, 0.928);
    const progB = span(p, 0.920, 0.968);
    const gl = this.gl;
    if (progA > 0.001) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.progs.mark.use()
        .set('u_res', scene.w, scene.h).set('u_time', this.time)
        .setArr('u_a', STROKE_A).setArr('u_b', STROKE_B)
        .set('u_progA', progA).set('u_progB', progB)
        .set('u_scale', 0.62 * clamp((cw / ch) / 1.5, 0.66, 1.0)).set('u_glow', 1.25);
      blit(gl, this.screenVAO, scene);
      gl.disable(gl.BLEND);
    }
    // wordmark painted beneath the mark
    const wmReveal = span(p, 0.955, 0.985);
    if (wmReveal > 0.001 && this.texts) {
      const wm = this.texts.wordmark;
      const w = Math.min(0.66, 1.5 * (ch / cw));
      composeModel(this.model, 0, -0.52, 0, 0, 0, w * 2, (w * 2 / wm.aspect) * (cw / ch));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.progs.text.use()
        .set('u_viewProj', this.identity).set('u_model', this.model)
        .bindTex('u_tex', 0, wm.tex)
        .set('u_color', 1.35, 1.28, 1.15)
        .set('u_opacity', 1).set('u_reveal', wmReveal).set('u_time', this.time);
      gl.bindVertexArray(this.particles.emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
  }

  /* ------------------------------------------------ DOM sync ---- */
  updateDOM(p) {
    for (const [name, b] of Object.entries(BEATS)) {
      let a = beatAlpha(p, b);
      // only whisper "move" to hands that have been still awhile
      if (name === 'touch' && this.pointer.moved && performance.now() - this.pointer.lastMoveT < 3500) a = 0;
      const prev = this._beatState[name] ?? -1;
      if (Math.abs(a - prev) < 0.004) continue;
      this._beatState[name] = a;
      const el = this.hud.beats[name];
      if (!el) continue;
      el.style.opacity = a.toFixed(3);
      el.style.visibility = a > 0.003 ? 'visible' : 'hidden';
      el.style.transform = `translateY(${((1 - a) * 18).toFixed(2)}px)`;
      if (name === 'sign') el.style.pointerEvents = a > 0.5 ? 'auto' : 'none';
    }
    this.hud.update(p);
  }

  /* -------------------------------------------------- cues ---- */
  emitCues(p) {
    let act = 0;
    for (let i = 0; i < ACT_STARTS.length; i++) if (p >= ACT_STARTS[i] - 0.004) act = i;
    if (act !== this.lastAct) {
      this.lastAct = act;
      this.score?.actChange(act);
    }
    for (let i = 0; i < WORDS.length; i++) {
      const w = WORDS[i];
      const a = window4(p, w.win[0], w.win[1], w.win[2], w.win[3]);
      if (a > 0.92 && this.lastAssembled !== i) {
        this.lastAssembled = i;
        this.score?.chime(i);
      }
    }
    if (p > 0.985 && this.lastAssembled !== 99) {
      this.lastAssembled = 99;
      this.score?.chime(4);
    }
  }
}

/* translate · rotY · rotX · scale — enough camera math for floating frames */
function composeModel(out, tx, ty, tz, ry, rx, sx, sy) {
  const cy = Math.cos(ry), sy_ = Math.sin(ry);
  const cx = Math.cos(rx), sx_ = Math.sin(rx);
  // R = Ry * Rx
  const r00 = cy, r01 = sy_ * sx_, r02 = sy_ * cx;
  const r10 = 0, r11 = cx, r12 = -sx_;
  const r20 = -sy_, r21 = cy * sx_, r22 = cy * cx;
  out[0] = r00 * sx; out[1] = r10 * sx; out[2] = r20 * sx; out[3] = 0;
  out[4] = r01 * sy; out[5] = r11 * sy; out[6] = r21 * sy; out[7] = 0;
  out[8] = r02; out[9] = r12; out[10] = r22; out[11] = 0;
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
}
