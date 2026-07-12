// Shared GLSL: the one screen-pass vertex shader + a noise library every
// world shader links against. String concatenation is our #include.

export const SCREEN_VS = /* glsl */`
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const NOISE = /* glsl */`
float hash11(float n){ return fract(sin(n)*43758.5453123); }
float hash21(vec2 p){
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p, p+45.32);
  return fract(p.x*p.y);
}
vec2 hash22(vec2 p){
  vec3 a = fract(p.xyx*vec3(123.34, 234.34, 345.65));
  a += dot(a, a+34.45);
  return fract(vec2(a.x*a.y, a.y*a.z));
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x),
             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f*f*(3.0-2.0*f);
  float n = i.x + i.y*57.0 + i.z*113.0;
  return mix(mix(mix(hash11(n),       hash11(n+1.0),   u.x),
                 mix(hash11(n+57.0),  hash11(n+58.0),  u.x), u.y),
             mix(mix(hash11(n+113.0), hash11(n+114.0), u.x),
                 mix(hash11(n+170.0), hash11(n+171.0), u.x), u.y), u.z);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for(int i=0;i<5;i++){ v += a*vnoise(p); p = r*p*2.03; a *= 0.5; }
  return v;
}
float fbm3(vec3 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ v += a*vnoise3(p); p = p*2.07 + vec3(11.3); a *= 0.5; }
  return v;
}
// cheap analytic-ish curl of a 2D noise field, for drift forces
vec2 curl2(vec2 p){
  float e = 0.12;
  float n1 = fbm(p + vec2(0.0, e));
  float n2 = fbm(p - vec2(0.0, e));
  float n3 = fbm(p + vec2(e, 0.0));
  float n4 = fbm(p - vec2(e, 0.0));
  return vec2((n1-n2), -(n3-n4)) / (2.0*e);
}
`;

// filmic helpers used by several passes
export const TONE = /* glsl */`
vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
`;
