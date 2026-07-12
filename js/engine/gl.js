// WebGL2 core: context, programs with cached uniforms, textures, FBOs, fullscreen blit.
// The whole engine draws with a single big triangle for screen passes and
// instanced/point geometry for world passes — no mesh loading, ever.

export function initGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  // Full experience needs renderable float targets (fluid + particle state).
  const extCBF = gl.getExtension('EXT_color_buffer_float');
  if (!extCBF) return null;
  gl.getExtension('OES_texture_float_linear'); // optional, nice-to-have

  // Fullscreen "big triangle" — one vao shared by every screen pass.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return { gl, screenVAO: vao };
}

const HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

export class Program {
  constructor(gl, vsSource, fsSource, name = 'program') {
    this.gl = gl;
    this.name = name;
    const vs = compile(gl, gl.VERTEX_SHADER, HEADER + vsSource, name + '.vert');
    const fs = compile(gl, gl.FRAGMENT_SHADER, HEADER + fsSource, name + '.frag');
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`[${name}] link: ` + gl.getProgramInfoLog(p));
    }
    this.handle = p;
    this.uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const key = info.name.replace('[0]', '');
      this.uniforms[key] = { loc: gl.getUniformLocation(p, info.name), type: info.type };
    }
  }
  use() { this.gl.useProgram(this.handle); return this; }
  // Type-dispatching setter; silently ignores uniforms optimized out by the compiler.
  set(name, ...v) {
    const u = this.uniforms[name];
    if (!u) return this;
    const gl = this.gl, loc = u.loc;
    switch (u.type) {
      case gl.FLOAT: gl.uniform1f(loc, v[0]); break;
      case gl.FLOAT_VEC2: gl.uniform2f(loc, v[0], v[1]); break;
      case gl.FLOAT_VEC3: gl.uniform3f(loc, v[0], v[1], v[2]); break;
      case gl.FLOAT_VEC4: gl.uniform4f(loc, v[0], v[1], v[2], v[3]); break;
      case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: gl.uniform1i(loc, v[0]); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(loc, false, v[0]); break;
      default: throw new Error(`[${this.name}] unhandled uniform type for ${name}`);
    }
    return this;
  }
  // flat Float32Array/array upload for uniform arrays (vec2[]/vec3[]/float[])
  setArr(name, arr) {
    const u = this.uniforms[name];
    if (!u) return this;
    const gl = this.gl;
    switch (u.type) {
      case gl.FLOAT: gl.uniform1fv(u.loc, arr); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, arr); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, arr); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, arr); break;
      default: throw new Error(`[${this.name}] unhandled array uniform ${name}`);
    }
    return this;
  }
  bindTex(name, unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this.set(name, unit);
    return this;
  }
}

function compile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    console.error(`[${name}]\n${log}\n${lines}`);
    throw new Error(`[${name}] compile failed: ${log}`);
  }
  return s;
}

export function createTexture(gl, w, h, { internal = gl.RGBA16F, format = gl.RGBA, type = gl.HALF_FLOAT, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, data = null } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  return t;
}

export function createFBO(gl, w, h, opts) {
  const tex = createTexture(gl, w, h, opts);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`FBO incomplete: status=0x${status.toString(16)} err=0x${gl.getError().toString(16)} size=${w}x${h}`);
  }
  return { fbo, tex, w, h };
}

export function createDoubleFBO(gl, w, h, opts) {
  let a = createFBO(gl, w, h, opts), b = createFBO(gl, w, h, opts);
  return {
    get read() { return a; },
    get write() { return b; },
    swap() { const t = a; a = b; b = t; },
    dispose() { destroyFBO(gl, a); destroyFBO(gl, b); },
    w, h,
  };
}

export function destroyFBO(gl, f) {
  if (!f) return;
  gl.deleteFramebuffer(f.fbo);
  gl.deleteTexture(f.tex);
}

// Draw the big triangle into a target ({fbo,w,h} or null = default framebuffer at cw×ch).
export function blit(gl, screenVAO, target, cw, ch) {
  if (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
  }
  gl.bindVertexArray(screenVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}
