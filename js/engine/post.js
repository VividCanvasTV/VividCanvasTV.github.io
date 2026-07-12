// HDR pipeline: scene RGBA16F → threshold → mip-chain bloom → filmic composite.
// A dropped frame breaks the spell, so every pass is a handful of taps.

import { Program, createFBO, destroyFBO, blit } from './gl.js';
import { SCREEN_VS, NOISE, TONE } from '../shaders/common.js';
import { POST } from '../shaders/post.js';

export class Post {
  constructor(gl, screenVAO) {
    this.gl = gl;
    this.vao = screenVAO;
    this.bright = new Program(gl, SCREEN_VS, POST.bright, 'post.bright');
    this.down = new Program(gl, SCREEN_VS, POST.down, 'post.down');
    this.up = new Program(gl, SCREEN_VS, POST.up, 'post.up');
    this.compositeProg = new Program(gl, SCREEN_VS, NOISE + TONE + POST.composite, 'post.composite');
    this.scene = null;
  }

  allocate(w, h, mips) {
    const gl = this.gl;
    destroyFBO(gl, this.scene);
    destroyFBO(gl, this.half); this.half = null;
    for (const m of this.mipsDown ?? []) destroyFBO(gl, m);
    for (const m of this.mipsUp ?? []) destroyFBO(gl, m);
    const rgba = { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR };
    this.w = w; this.h = h; this.mips = mips;
    this.scene = createFBO(gl, w, h, rgba);
    destroyFBO(gl, this.half);
    this.half = createFBO(gl, Math.max(2, w >> 1), Math.max(2, h >> 1), rgba); // heavy passes render here
    this.mipsDown = []; this.mipsUp = [];
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < mips && mw > 8 && mh > 8; i++) {
      this.mipsDown.push(createFBO(gl, mw, mh, rgba));
      this.mipsUp.push(createFBO(gl, mw, mh, rgba));
      mw >>= 1; mh >>= 1;
    }
  }

  // scene FBO is bound by the director during world drawing; this consumes it.
  composite(cw, ch, u) {
    const gl = this.gl, vao = this.vao;
    gl.disable(gl.BLEND);

    const n = this.mipsDown.length;
    this.bright.use().bindTex('u_scene', 0, this.scene.tex)
      .set('u_threshold', u.threshold ?? 0.8).set('u_knee', 0.55);
    blit(gl, vao, this.mipsDown[0]);

    for (let i = 1; i < n; i++) {
      const src = this.mipsDown[i - 1];
      this.down.use().bindTex('u_src', 0, src.tex).set('u_texel', 1 / src.w, 1 / src.h);
      blit(gl, vao, this.mipsDown[i]);
    }
    // climb back up, accumulating
    let src = this.mipsDown[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      this.up.use()
        .bindTex('u_src', 0, src.tex)
        .bindTex('u_base', 1, this.mipsDown[i].tex)
        .set('u_texel', 1 / src.w, 1 / src.h).set('u_mix', 1.0);
      blit(gl, vao, this.mipsUp[i]);
      src = this.mipsUp[i];
    }

    this.compositeProg.use()
      .bindTex('u_scene', 0, this.scene.tex)
      .bindTex('u_bloom', 1, src.tex)
      .set('u_res', cw, ch).set('u_time', u.time)
      .set('u_bloomAmt', u.bloom ?? 0.85)
      .set('u_grain', u.grain ?? 0.05)
      .set('u_vignette', u.vignette ?? 0.55)
      .set('u_ca', u.ca ?? 0).set('u_fade', u.fade ?? 1);
    blit(gl, vao, null, cw, ch);
  }
}
