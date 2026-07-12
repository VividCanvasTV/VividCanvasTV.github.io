// The pigment. Owns its ping-pong targets and the whole solver schedule;
// the Director only speaks to it in splats and act parameters.

import { Program, createDoubleFBO, createFBO, destroyFBO, blit } from '../engine/gl.js';
import { SCREEN_VS } from '../shaders/common.js';
import { FLUID } from '../shaders/fluid.js';

export class Fluid {
  constructor(gl, screenVAO, tier) {
    this.gl = gl;
    this.vao = screenVAO;
    this.programs = {};
    for (const [k, src] of Object.entries(FLUID)) {
      this.programs[k] = new Program(gl, SCREEN_VS, src, `fluid.${k}`);
    }
    this.pending = [];         // queued splats {x,y,dx,dy,r,g,b,radius}
    this.allocate(tier);
  }

  allocate(tier) {
    const gl = this.gl;
    // reallocation must not orphan GPU memory
    this.velocity?.dispose(); this.pressure?.dispose(); this.dye?.dispose();
    destroyFBO(gl, this.divergence); destroyFBO(gl, this.curl);
    const raw = innerWidth / innerHeight;
    const aspect = Number.isFinite(raw) && raw > 0.2 ? Math.min(raw, 3.2) : 16 / 9;
    const dyeW = Math.max(2, Math.round(tier.dyeRes * aspect));
    const simW = Math.max(2, Math.round(tier.velRes * aspect));
    this.jacobi = tier.jacobi;
    const rg = { internal: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT, filter: gl.LINEAR };
    const r = { internal: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT, filter: gl.NEAREST };
    const rgba = { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR };
    this.velocity = createDoubleFBO(gl, simW, tier.velRes, rg);
    this.pressure = createDoubleFBO(gl, simW, tier.velRes, r);
    this.divergence = createFBO(gl, simW, tier.velRes, r);
    this.curl = createFBO(gl, simW, tier.velRes, r);
    this.dye = createDoubleFBO(gl, dyeW, tier.dyeRes, rgba);
    this.simTexel = [1 / simW, 1 / tier.velRes];
    this.dyeTexel = [1 / dyeW, 1 / tier.dyeRes];
  }

  // x,y ∈ 0..1 (y-up) · d = velocity impulse · rgb = HDR dye
  splat(x, y, dx, dy, r, g, b, radius = 0.0016) {
    this.pending.push({ x, y, dx, dy, r, g, b, radius });
  }

  step(dt) {
    const gl = this.gl, P = this.programs, vao = this.vao;
    const aspect = this.dye.read.w / this.dye.read.h;
    gl.disable(gl.BLEND);

    for (const s of this.pending) {
      P.splat.use()
        .bindTex('u_target', 0, this.velocity.read.tex)
        .set('u_point', s.x, s.y).set('u_radius', s.radius * 2.2)
        .set('u_aspect', aspect).set('u_value', s.dx, s.dy, 0);
      blit(gl, vao, this.velocity.write); this.velocity.swap();
      P.splat.use()
        .bindTex('u_target', 0, this.dye.read.tex)
        .set('u_point', s.x, s.y).set('u_radius', s.radius)
        .set('u_aspect', aspect).set('u_value', s.r, s.g, s.b);
      blit(gl, vao, this.dye.write); this.dye.swap();
    }
    this.pending.length = 0;

    P.curl.use().bindTex('u_velocity', 0, this.velocity.read.tex).set('u_texel', ...this.simTexel);
    blit(gl, vao, this.curl);

    P.vorticity.use()
      .bindTex('u_velocity', 0, this.velocity.read.tex)
      .bindTex('u_curl', 1, this.curl.tex)
      .set('u_texel', ...this.simTexel).set('u_strength', 17).set('u_dt', dt);
    blit(gl, vao, this.velocity.write); this.velocity.swap();

    P.divergence.use().bindTex('u_velocity', 0, this.velocity.read.tex).set('u_texel', ...this.simTexel);
    blit(gl, vao, this.divergence);

    P.clearp.use().bindTex('u_pressure', 0, this.pressure.read.tex).set('u_decay', 0.8);
    blit(gl, vao, this.pressure.write); this.pressure.swap();

    for (let i = 0; i < this.jacobi; i++) {
      P.pressure.use()
        .bindTex('u_pressure', 0, this.pressure.read.tex)
        .bindTex('u_divergence', 1, this.divergence.tex)
        .set('u_texel', ...this.simTexel);
      blit(gl, vao, this.pressure.write); this.pressure.swap();
    }

    P.gradient.use()
      .bindTex('u_pressure', 0, this.pressure.read.tex)
      .bindTex('u_velocity', 1, this.velocity.read.tex)
      .set('u_texel', ...this.simTexel);
    blit(gl, vao, this.velocity.write); this.velocity.swap();

    P.advect.use()
      .bindTex('u_velocity', 0, this.velocity.read.tex)
      .bindTex('u_source', 0, this.velocity.read.tex)   // same unit: source IS velocity
      .set('u_texel', ...this.simTexel).set('u_dt', dt).set('u_dissipation', 0.995);
    blit(gl, vao, this.velocity.write); this.velocity.swap();

    P.advect.use()
      .bindTex('u_velocity', 0, this.velocity.read.tex)
      .bindTex('u_source', 1, this.dye.read.tex)
      .set('u_texel', ...this.simTexel).set('u_dt', dt).set('u_dissipation', 0.976);
    blit(gl, vao, this.dye.write); this.dye.swap();
  }

  // draw dye into the scene (additive), with pull-back framing
  display(target, cw, ch, opacity, zoom = 1, offx = 0, offy = 0) {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.programs.display.use()
      .bindTex('u_dye', 0, this.dye.read.tex)
      .set('u_opacity', opacity).set('u_zoom', zoom).set('u_offset', offx, offy);
    blit(gl, this.vao, target, cw, ch);
    gl.disable(gl.BLEND);
  }
}
