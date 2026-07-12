// GPU particles. State lives in two RGBA32F textures (position+seed, velocity)
// updated in a single MRT pass; rendering fetches state by gl_VertexID.
// The same 262,144 particles play every role: dust motes, typography,
// portal embers, and the final convergence spiral. They never despawn —
// they just change allegiance.

export const PARTICLES = {

sim: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_pos;      // xyz = position, w = seed
uniform sampler2D u_vel;      // xyz = velocity
uniform sampler2D u_target;   // xyz = target, w = has-target
uniform float u_dt;
uniform float u_time;
uniform float u_assemble;     // 0..1 — how strongly typography claims particles
uniform float u_stagger;      // per-particle assembly spread
uniform float u_drift;        // curl-noise wander
uniform vec3 u_pointer;       // pointer projected into world
uniform vec3 u_pointerVel;
uniform float u_pointerStr;
uniform vec4 u_attract;       // xyz = attractor (stroke tip), w = strength
uniform float u_swirl;        // tangential force around attractor
uniform float u_orbitR;       // >0: radial pull dies inside this radius (halo, not capture)
uniform vec3 u_home;          // center of the ambient cloud
uniform float u_containR;     // soft containment radius
layout(location=0) out vec4 o_pos;
layout(location=1) out vec4 o_vel;

void main(){
  vec4 P = texture(u_pos, v_uv);
  vec3 vel = texture(u_vel, v_uv).xyz;
  vec4 T = texture(u_target, v_uv);
  float seed = P.w;
  vec3 pos = P.xyz;
  vec3 F = vec3(0.0);

  // wander — layered curl noise, z gets its own slow wave
  vec2 c = curl2(pos.xy * 0.35 + vec2(u_time * 0.03, seed * 7.0) + pos.z * 0.11);
  F += vec3(c * 0.5, sin(u_time * 0.4 + seed * 6.2831 + pos.x) * 0.22) * u_drift;

  // typography — staggered spring toward assigned glyph point
  float local = smoothstep(0.0, 1.0, (u_assemble * (1.0 + u_stagger) - seed * u_stagger));
  float claim = T.w * local;
  if (claim > 0.001) {
    vec3 d = T.xyz - pos;
    F += d * (26.0 * claim);
    // settle: kill orbiting once close and claimed
    float near = exp(-dot(d,d) * 18.0);
    vel *= 1.0 - 0.35 * claim * near;
  }

  // pointer — a brush that displaces and drags
  vec3 dp = pos - u_pointer;
  float pd2 = dot(dp, dp);
  float pfall = exp(-pd2 * 2.2);
  F += (normalize(dp + 1e-5) * 3.0 + u_pointerVel * 2.2) * pfall * u_pointerStr;

  // convergence — spiral into the stroke tip (Act V)
  if (u_attract.w > 0.001) {
    vec3 da = u_attract.xyz - pos;
    float ad = length(da) + 1e-4;
    vec3 dir = da / ad;
    vec3 tangent = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + 1e-5);
    float pull = u_attract.w * (1.0 - claim);
    float radial = (u_orbitR > 0.001) ? smoothstep(u_orbitR * 0.5, u_orbitR, ad) : 1.0;
    F += dir * pull * (2.0 + 6.0 / (ad + 0.4)) * radial;
    F += tangent * u_swirl * pull * 2.4 / (ad + 0.5);
  }

  // soft containment — drift home, never wander off-stage
  vec3 dh = u_home - pos;
  float hd = length(dh);
  F += dh * smoothstep(u_containR, u_containR * 1.8, hd) * 2.0;

  vel += F * u_dt;
  vel *= exp(-u_dt * (1.6 + 4.0 * claim));
  float spd = length(vel);
  if (spd > 6.0) vel *= 6.0 / spd;
  pos += vel * u_dt;

  o_pos = vec4(pos, seed);
  o_vel = vec4(vel, claim);   // renderer dims condensed ink per-particle
}`,

renderVS: /* glsl */`
uniform sampler2D u_pos;
uniform sampler2D u_vel;
uniform mat4 u_viewProj;
uniform float u_size;      // base sprite size in px·world units
uniform int u_texW;
out float v_speed;
out float v_seed;
out float v_fade;
out float v_claim;
void main(){
  ivec2 tc = ivec2(gl_VertexID % u_texW, gl_VertexID / u_texW);
  vec4 P = texelFetch(u_pos, tc, 0);
  vec4 V = texelFetch(u_vel, tc, 0);
  vec4 clip = u_viewProj * vec4(P.xyz, 1.0);
  gl_Position = clip;
  float w = max(clip.w, 0.2);
  v_claim = clamp(V.w, 0.0, 1.0);
  gl_PointSize = clamp(u_size / w, 0.75, 44.0) * mix(1.0, 0.6, v_claim);
  v_speed = length(V.xyz);
  v_seed = P.w;
  // fade extremely close particles; distant ones sink into depth-fog
  v_fade = smoothstep(0.25, 1.2, w) * smoothstep(30.0, 14.0, w);
}`,

renderFS: /* glsl */`
in float v_speed;
in float v_seed;
in float v_fade;
in float v_claim;
uniform vec3 u_colA;
uniform vec3 u_colB;
uniform float u_opacity;
uniform float u_time;
out vec4 o;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float d2 = dot(q, q);
  if (d2 > 0.25) discard;
  float core = exp(-d2 * 18.0);
  float halo = exp(-d2 * 6.0) * 0.45;
  float tw = 0.75 + 0.25 * sin(u_time * (1.5 + v_seed * 3.0) + v_seed * 40.0);
  vec3 col = mix(u_colA, u_colB, v_seed);
  col = mix(col, vec3(1.0), clamp(v_speed * 0.22, 0.0, 0.55)); // fast = hot
  // condensed ink: many particles share each glyph pixel — each must carry less light
  float a = (core + halo) * tw * v_fade * u_opacity * mix(1.0, 0.06, v_claim);
  o = vec4(col * a, a); // premultiplied, blended ONE,ONE (additive)
}`,
};
