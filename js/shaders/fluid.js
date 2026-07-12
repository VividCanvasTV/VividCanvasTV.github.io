// GPU fluid: Stam-style stable fluids on half-float ping-pong targets.
// velocity (RG16F) · dye (RGBA16F, HDR colors > 1 feed the bloom) ·
// curl/divergence/pressure (R16F). Vorticity confinement keeps it alive.

export const FLUID = {

splat: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_target;
uniform vec2 u_point;
uniform vec3 u_value;      // velocity.xy0 or dye rgb
uniform float u_radius;
uniform float u_aspect;
out vec4 o;
void main(){
  vec2 d = v_uv - u_point;
  d.x *= u_aspect;
  float g = exp(-dot(d,d) / u_radius);
  vec4 base = texture(u_target, v_uv);
  o = vec4(base.rgb + u_value * g, 1.0);
}`,

advect: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_texel;       // texel of the velocity field
uniform float u_dt;
uniform float u_dissipation;
out vec4 o;
void main(){
  vec2 vel = texture(u_velocity, v_uv).xy;
  vec2 coord = v_uv - u_dt * vel * u_texel;
  o = texture(u_source, coord) * u_dissipation;
}`,

curl: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_velocity;
uniform vec2 u_texel;
out vec4 o;
void main(){
  float L = texture(u_velocity, v_uv - vec2(u_texel.x, 0.0)).y;
  float R = texture(u_velocity, v_uv + vec2(u_texel.x, 0.0)).y;
  float B = texture(u_velocity, v_uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_velocity, v_uv + vec2(0.0, u_texel.y)).x;
  o = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 1.0);
}`,

vorticity: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform vec2 u_texel;
uniform float u_strength;
uniform float u_dt;
out vec4 o;
void main(){
  float L = texture(u_curl, v_uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_curl, v_uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_curl, v_uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_curl, v_uv + vec2(0.0, u_texel.y)).x;
  float C = texture(u_curl, v_uv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= u_strength * C * vec2(1.0, -1.0);
  vec2 vel = texture(u_velocity, v_uv).xy + force * u_dt;
  o = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}`,

divergence: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_velocity;
uniform vec2 u_texel;
out vec4 o;
void main(){
  float L = texture(u_velocity, v_uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_velocity, v_uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_velocity, v_uv - vec2(0.0, u_texel.y)).y;
  float T = texture(u_velocity, v_uv + vec2(0.0, u_texel.y)).y;
  vec2 C = texture(u_velocity, v_uv).xy;
  if (v_uv.x - u_texel.x < 0.0) L = -C.x;
  if (v_uv.x + u_texel.x > 1.0) R = -C.x;
  if (v_uv.y - u_texel.y < 0.0) B = -C.y;
  if (v_uv.y + u_texel.y > 1.0) T = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,

clearp: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_pressure;
uniform float u_decay;
out vec4 o;
void main(){ o = u_decay * texture(u_pressure, v_uv); }`,

pressure: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texel;
out vec4 o;
void main(){
  float L = texture(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
  float div = texture(u_divergence, v_uv).x;
  o = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`,

gradient: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texel;
out vec4 o;
void main(){
  float L = texture(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
  vec2 vel = texture(u_velocity, v_uv).xy - vec2(R - L, T - B);
  o = vec4(vel, 0.0, 1.0);
}`,

// Screen composite of the dye field: uv pull-back transform + edge falloff
// so Act II→III reads as the camera lifting away from the wet surface.
display: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_dye;
uniform float u_opacity;
uniform float u_zoom;       // 1 = flush with screen, >1 = pulled back
uniform vec2 u_offset;
out vec4 o;
void main(){
  vec2 uv = (v_uv - 0.5) * u_zoom + 0.5 + u_offset;
  vec3 c = texture(u_dye, uv).rgb;
  // soft-knee: pigment may glow (HDR ~2) but can never white out the frame
  c = c / (1.0 + 0.22 * max(max(c.r, c.g), max(c.b, 0.0)));
  float edge = smoothstep(0.0, 0.16, uv.x) * smoothstep(1.0, 0.84, uv.x)
             * smoothstep(0.0, 0.14, uv.y) * smoothstep(1.0, 0.86, uv.y);
  // pigment lives at the heart of the canvas, not in its gutters
  edge *= smoothstep(1.3, 0.62, length((uv - 0.5) * 2.0));
  // soft self-shadow: dense pigment darkens before it glows
  o = vec4(c * u_opacity * edge, 1.0);
}`,
};
