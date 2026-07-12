// The sparks. One immortal population of GPU particles whose loyalties change
// per act: free dust → typography → embers → the convergence spiral.

import { Program, createTexture } from '../engine/gl.js';
import { SCREEN_VS, NOISE } from '../shaders/common.js';
import { PARTICLES } from '../shaders/particles.js';

export class Particles {
  constructor(gl, screenVAO, tier) {
    this.gl = gl;
    this.screenVAO = screenVAO;
    this.simProg = new Program(gl, SCREEN_VS, NOISE + PARTICLES.sim, 'particles.sim');
    this.renderProg = new Program(gl, PARTICLES.renderVS, PARTICLES.renderFS, 'particles.render');
    this.emptyVAO = gl.createVertexArray();   // gl_VertexID-only draws
    this.allocate(tier);
  }

  allocate(tier) {
    const gl = this.gl;
    for (const s of this.state ?? []) {
      gl.deleteFramebuffer(s.fbo); gl.deleteTexture(s.pos); gl.deleteTexture(s.vel);
    }
    if (this.noTargets) gl.deleteTexture(this.noTargets);
    for (const t of this._targetCache?.values() ?? []) gl.deleteTexture(t);
    this.w = tier.particlesW; this.h = tier.particlesH;
    this.count = this.w * this.h;

    const posData = new Float32Array(this.count * 4);
    const velData = new Float32Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      // birth cloud: a wide thin nebula the camera will fly through
      const r = Math.pow(Math.random(), 0.5) * 7;
      const a = Math.random() * Math.PI * 2;
      posData[i * 4 + 0] = Math.cos(a) * r * 1.6;
      posData[i * 4 + 1] = Math.sin(a) * r * 0.8;
      posData[i * 4 + 2] = (Math.random() - 0.5) * 22;
      posData[i * 4 + 3] = Math.random();   // seed
    }
    const opts = { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST };
    this.state = [0, 1].map(() => {
      const pos = createTexture(gl, this.w, this.h, { ...opts, data: posData });
      const vel = createTexture(gl, this.w, this.h, { ...opts, data: velData });
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pos, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, vel, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('particle MRT incomplete');
      }
      return { fbo, pos, vel };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cur = 0;

    // default target texture: nobody has a target
    this.noTargets = createTexture(gl, this.w, this.h, { ...opts, data: new Float32Array(this.count * 4) });
    this.targets = this.noTargets;
    this._targetCache = new Map();
  }

  // data: Float32Array(count*4) of xyz+flag, keyed for reuse
  setTargets(key, dataFactory) {
    if (key === null) { this.targets = this.noTargets; return; }
    if (!this._targetCache.has(key)) {
      const gl = this.gl;
      // bounded cache: evict the oldest target set (insertion order) before minting
      if (this._targetCache.size >= 12) {
        const [k0, t0] = this._targetCache.entries().next().value;
        gl.deleteTexture(t0);
        this._targetCache.delete(k0);
      }
      const tex = createTexture(gl, this.w, this.h, {
        internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST,
        data: dataFactory(),
      });
      this._targetCache.set(key, tex);
    }
    this.targets = this._targetCache.get(key);
  }

  step(dt, u) {
    const gl = this.gl;
    const src = this.state[this.cur], dst = this.state[1 - this.cur];
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.w, this.h);
    this.simProg.use()
      .bindTex('u_pos', 0, src.pos)
      .bindTex('u_vel', 1, src.vel)
      .bindTex('u_target', 2, this.targets)
      .set('u_dt', Math.min(dt, 1 / 30)).set('u_time', u.time)
      .set('u_assemble', u.assemble).set('u_stagger', u.stagger ?? 0.6)
      .set('u_drift', u.drift)
      .set('u_pointer', ...u.pointer).set('u_pointerVel', ...u.pointerVel)
      .set('u_pointerStr', u.pointerStr)
      .set('u_attract', ...u.attract)
      .set('u_swirl', u.swirl ?? 1)
      .set('u_orbitR', u.orbitR ?? 0)
      .set('u_home', ...u.home).set('u_containR', u.containR ?? 14);
    gl.bindVertexArray(this.screenVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.cur = 1 - this.cur;
  }

  render(target, cw, ch, u) {
    const gl = this.gl;
    const src = this.state[this.cur];
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.renderProg.use()
      .bindTex('u_pos', 0, src.pos)
      .bindTex('u_vel', 1, src.vel)
      .set('u_viewProj', u.viewProj)
      .set('u_size', u.size).set('u_texW', this.w)
      .set('u_colA', ...u.colA).set('u_colB', ...u.colB)
      .set('u_opacity', u.opacity).set('u_time', u.time);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
