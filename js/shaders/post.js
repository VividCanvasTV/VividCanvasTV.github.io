// Post stack: mip-chain bloom + the final filmic composite
// (ACES, grain, vignette, velocity-reactive chromatic aberration).

export const POST = {

bright: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_scene;
uniform float u_threshold;
uniform float u_knee;
out vec4 o;
void main(){
  vec3 c = texture(u_scene, v_uv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float soft = clamp(lum - u_threshold + u_knee, 0.0, 2.0 * u_knee);
  soft = soft * soft / (4.0 * u_knee + 1e-4);
  float w = max(soft, lum - u_threshold) / max(lum, 1e-4);
  o = vec4(c * w, 1.0);
}`,

down: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
out vec4 o;
void main(){
  vec4 c = texture(u_src, v_uv) * 4.0;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0));
  c += texture(u_src, v_uv + u_texel * vec2( 1.0, -1.0));
  c += texture(u_src, v_uv + u_texel * vec2(-1.0,  1.0));
  c += texture(u_src, v_uv + u_texel * vec2( 1.0,  1.0));
  o = c * 0.125;
}`,

up: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_src;      // smaller mip
uniform sampler2D u_base;     // current level accumulation
uniform vec2 u_texel;
uniform float u_mix;
out vec4 o;
void main(){
  vec4 s = vec4(0.0);
  s += texture(u_src, v_uv + u_texel * vec2(-1.0,  0.0)) * 2.0;
  s += texture(u_src, v_uv + u_texel * vec2( 1.0,  0.0)) * 2.0;
  s += texture(u_src, v_uv + u_texel * vec2( 0.0, -1.0)) * 2.0;
  s += texture(u_src, v_uv + u_texel * vec2( 0.0,  1.0)) * 2.0;
  s += texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0));
  s += texture(u_src, v_uv + u_texel * vec2( 1.0, -1.0));
  s += texture(u_src, v_uv + u_texel * vec2(-1.0,  1.0));
  s += texture(u_src, v_uv + u_texel * vec2( 1.0,  1.0));
  s += texture(u_src, v_uv) * 4.0;
  o = texture(u_base, v_uv) + s / 16.0 * u_mix;
}`,

composite: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform vec2 u_res;
uniform float u_time;
uniform float u_bloomAmt;
uniform float u_grain;
uniform float u_vignette;
uniform float u_ca;        // chromatic aberration strength (scroll-velocity fed)
uniform float u_fade;      // boot / act fades
out vec4 o;
void main(){
  vec2 uv = v_uv;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);

  vec3 scene;
  if (u_ca > 0.0001) {
    vec2 sh = c * r2 * u_ca * 0.016;   // u_ca is intent 0..1; shift stays sub-pixel-ish
    scene.r = texture(u_scene, uv + sh).r;
    scene.g = texture(u_scene, uv).g;
    scene.b = texture(u_scene, uv - sh).b;
  } else {
    scene = texture(u_scene, uv).rgb;
  }
  vec3 bloom = texture(u_bloom, uv).rgb;
  vec3 col = scene + bloom * u_bloomAmt;

  col = aces(col);
  col = pow(col, vec3(0.95));                 // gentle lift
  col *= 1.0 - u_vignette * smoothstep(0.18, 0.62, r2);

  float g = hash21(uv * u_res + fract(u_time * 61.7) * 917.0) - 0.5;
  float lum = dot(col, vec3(0.3, 0.6, 0.1));
  col += g * u_grain * (0.22 + 0.55 * (1.0 - lum));

  o = vec4(col * u_fade, 1.0);
}`,
};
