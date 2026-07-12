// World shaders: the linen void + falling droplet, volumetric beams,
// the four portal worlds, the painted mark, and in-world text quads.

export const WORLD = {

/* ------------------------------------------------------------------
   THE COSMOS + THE GATES — the universal background of the story.
   Act I: a monumental arched gate in deep space, doors parting onto a
   blazing paradise-universe; galaxies and supernovae in the dark.
   Later acts: the cosmos persists at act-tuned richness; the linen
   weave returns for the finale. One pass, every frame.
------------------------------------------------------------------- */
voidFS: /* glsl */`
in v2 v_uvDECL
uniform vec2 u_res;
uniform float u_time;
uniform float u_impact;    // threshold burst envelope
uniform float u_weave;     // linen visibility (finale)
uniform float u_base;      // ambient floor of the dark
uniform vec2 u_pointer;
uniform float u_gateOn;    // gate visibility
uniform float u_gate;      // doors open 0..1
uniform float u_zoom;      // approach: 1 = far, ~7 = through the threshold
uniform float u_cosmic;    // background richness (galaxies/novae/nebula)
uniform float u_detail;    // 1 = full cosmos, 0 = lean tier
uniform float u_calm;      // dims the vortex while words need the stage
out vec4 o;

float threads(vec2 u){
  float ny = vnoise(vec2(floor(u.y), 3.7)) * 0.8;
  float nx = vnoise(vec2(floor(u.x), 9.1)) * 0.8;
  float wx = 0.5 + 0.5 * cos((fract(u.x) - 0.5) * 6.2831);
  float wy = 0.5 + 0.5 * cos((fract(u.y) - 0.5) * 6.2831);
  float over = step(0.5, fract((floor(u.x) + floor(u.y)) * 0.5));
  return mix(wx * (0.75 + ny), wy * (0.75 + nx), over);
}

vec3 galaxy(vec2 p, float rot, float seed){
  float c = cos(rot), s = sin(rot);
  p = mat2(c, -s, s, c) * p;
  p.y *= 2.3;                                   // inclination
  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x);
  float arm = 0.5 + 0.5 * cos(a * 2.0 - log(r) * 6.5 + u_time * 0.02 + seed * 40.0);
  float disk = exp(-r * 5.2);
  float dust = fbm(p * 5.0 + seed * 9.0);
  float core = exp(-r * 15.0) * 1.2;
  vec3 cA = mix(vec3(1.0, 0.45, 0.55), vec3(0.42, 0.62, 1.0), fract(seed * 7.31));
  vec3 cB = mix(vec3(0.95, 0.80, 0.55), vec3(0.45, 0.95, 0.82), fract(seed * 3.77));
  return (cA * arm * disk * (0.22 + 0.78 * dust) + cB * core * (0.6 + 0.4 * dust)) * 0.75;
}

vec3 nova(vec2 p, float period, float seed){
  float cycle = floor(u_time / period + seed * 17.0);
  float ph = fract(u_time / period + seed * 17.0);
  vec2 pos = (hash22(vec2(cycle, seed * 91.7)) - 0.5) * vec2(1.7, 0.95);
  vec2 d = p - pos;
  float dist = length(d);
  float flash = exp(-ph * 15.0);
  float star = exp(-dist * dist * 2600.0) * flash * 7.0;
  float cross = (exp(-abs(d.x) * 90.0) * exp(-abs(d.y) * 13.0)
               + exp(-abs(d.y) * 90.0) * exp(-abs(d.x) * 13.0)) * flash * 1.3;
  float rw = (dist - ph * 0.28) * 26.0;               // manual square: pow(neg, y) is NaN on some drivers
  float ring = exp(-rw * rw) * exp(-ph * 7.0) * 0.55;
  vec3 col = mix(vec3(1.0, 0.85, 0.60), vec3(1.0, 0.38, 0.52), fract(seed * 5.13));
  return col * (star + cross + ring);
}

float archSDF(vec2 p, vec2 half_){
  vec2 q = vec2(abs(p.x), p.y);
  float rect = max(q.x - half_.x, max(-p.y, p.y - half_.y));
  float cap = length(p - vec2(0.0, half_.y)) - half_.x;
  return min(rect, cap);
}

float starLayer(vec2 sp, float thresh){
  vec2 cell = floor(sp);
  float st = step(thresh, hash21(cell));
  vec2 off = hash22(cell) - 0.5;
  float sd = length(fract(sp) - 0.5 - off * 0.7);
  float tw = 0.6 + 0.4 * sin(u_time * (1.0 + hash21(cell + 7.0) * 2.5) + hash21(cell) * 40.0);
  return st * exp(-sd * sd * 170.0) * tw;
}

void main(){
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 p0 = (v_uv - 0.5) * asp;

  // approach: the world scales around the gate as you scroll toward it
  vec2 gateC = vec2(0.0, -0.02);
  vec2 p = (p0 - gateC) / u_zoom + gateC;

  vec3 col = vec3(0.004, 0.004, 0.008);
  col += vec3(0.012, 0.011, 0.016) * u_base * 8.0;

  // starfield — two depths, both drifting slower than the gate (parallax)
  float rich = u_cosmic;
  col += vec3(0.85, 0.85, 1.0) * starLayer(p0 * 22.0 + 3.0, 0.978) * (0.14 + 0.5 * rich);
  col += vec3(1.0, 0.92, 0.8) * starLayer(p * 11.0, 0.982) * (0.2 + 0.8 * rich);

  if (rich > 0.004) {
    // nebula wisps — the studio's inks smoked into space
    float n1 = fbm(p * 2.3 + vec2(0.0, u_time * 0.008));
    float n2 = fbm(p * 3.0 - vec2(u_time * 0.006, 13.0));
    col += vec3(0.60, 0.12, 0.30) * pow(max(n1 - 0.42, 0.0), 1.6) * rich * 1.2;
    col += vec3(0.15, 0.28, 0.62) * pow(max(n2 - 0.45, 0.0), 1.7) * rich * 0.9;
    if (u_detail > 0.5) {
      col += vec3(0.10, 0.46, 0.36) * pow(max(fbm(p * 1.7 + 31.0) - 0.50, 0.0), 1.8) * rich * 0.9;
    }
    // galaxies
    col += galaxy((p - vec2(-0.58, 0.30)) * 2.5, 0.7, 0.31) * rich * 0.9;
    col += galaxy((p - vec2(0.64, -0.22)) * 3.3, -0.4, 0.77) * rich * 0.75;
    if (u_detail > 0.5) {
      col += galaxy((p - vec2(0.30, 0.44)) * 4.6, 1.9, 0.55) * rich * 0.55;
    }
    // supernovae — stars dying gorgeously on a timer
    col += nova(p, 6.3, 0.37) * rich;
    if (u_detail > 0.5) col += nova(p, 9.1, 0.83) * rich * 0.85;
  }

  /* ---- THE GATES ---- */
  if (u_gateOn > 0.004) {
    vec2 gp = p - gateC + vec2(0.0, 0.185);     // arch base frame
    float arch = archSDF(gp, vec2(0.165, 0.315));
    float inside = smoothstep(0.004, -0.004, arch);
    float gap = 0.012 + u_gate * 0.17;          // doors part past the jamb
    float openMask = inside * smoothstep(gap + 0.005, gap - 0.005, abs(gp.x));
    float doorMask = max(inside - openMask, 0.0);

    // interior — the universe we paint, sampled in SCREEN space so the
    // approach reads as entering a place, never zooming into a white core
    vec2 ip = (p0 - gateC) * 2.1 + vec2(0.0, 0.06);
    float ir = length(ip) + 1e-4;
    float ia = atan(ip.y, ip.x);
    float swirl = 0.5 + 0.5 * cos(ia * 3.0 - log(ir) * 6.0 + u_time * 0.30);
    float swirl2 = 0.5 + 0.5 * cos(ia * 5.0 + log(ir) * 9.0 - u_time * 0.22);
    // paradise hues wheel around the heart: rose → amber → emerald → teal
    vec3 hueA = mix(vec3(1.0, 0.30, 0.45), vec3(1.0, 0.72, 0.30), 0.5 + 0.5 * sin(ia * 2.0 + u_time * 0.20));
    vec3 hueB = mix(vec3(0.12, 0.85, 0.45), vec3(0.15, 0.72, 0.92), 0.5 + 0.5 * cos(ia * 3.0 - u_time * 0.16));
    vec3 inCol = vec3(0.018, 0.012, 0.05);
    inCol += hueA * pow(clamp(swirl, 0.0, 1.0), 2.3) * exp(-ir * 1.0) * 1.05;
    inCol += hueB * pow(clamp(swirl2, 0.0, 1.0), 2.7) * exp(-ir * 0.6) * 0.8;
    inCol += vec3(1.0, 0.90, 0.70) * exp(-ir * ir * 22.0) * 1.9;   // heart of light
    inCol += vec3(0.85, 1.0, 0.80) * pow(max(fbm(ip * 2.2 - vec2(0.0, u_time * 0.18)) - 0.46, 0.0), 1.8) * 1.1;
    inCol += vec3(0.9, 0.95, 1.0) * starLayer(ip * 15.0 + 40.0, 0.982) * 0.9;  // stars inside
    inCol *= (0.75 + 0.55 * u_gate) * u_calm;
    col = mix(col, inCol, openMask * u_gateOn);

    // door slabs — burnished, engraved, lit by the light they hold back
    // glow falloffs scale with zoom so approach never dissolves into wash
    float zk = 0.4 + 0.6 * u_zoom;
    vec3 doorCol = vec3(0.020, 0.016, 0.026) + vec3(0.085, 0.062, 0.088) * fbm(gp * vec2(9.0, 26.0) * (0.6 + 0.4 * u_zoom));
    doorCol += vec3(0.55, 0.38, 0.26) * exp(-abs(abs(gp.x) - gap) * 7.0 * zk) * 0.32;
    doorCol += vec3(0.30, 0.22, 0.30) * exp(-abs(gp.y - 0.10) * 5.0) * 0.22;
    float edgeBlaze = exp(-abs(abs(gp.x) - gap) * 80.0 * zk) * (0.9 + 0.5 * sin(u_time * 2.1));
    doorCol += vec3(1.0, 0.72, 0.42) * edgeBlaze * (1.6 + 1.2 * u_gate);
    col = mix(col, doorCol, doorMask * u_gateOn * 0.97);

    // arch rim halo + light spill into the dark
    float rim = exp(-abs(arch) * 65.0 * (0.5 + 0.5 * u_zoom));
    col += vec3(1.0, 0.66, 0.40) * rim * (0.55 + 0.9 * u_gate) * u_gateOn;
    float spill = exp(-max(arch, 0.0) * 6.5 * (0.4 + 0.6 * u_zoom)) * (0.22 + 0.78 * u_gate);
    col += vec3(1.0, 0.70, 0.42) * spill * 0.55 * u_gateOn;
    // light pooling on the unseen floor
    if (gp.y < -0.26) {
      float fx = exp(-abs(gp.x) * 9.0 / (0.25 + u_gate));
      float fy = exp((gp.y + 0.26) * 6.0);
      col += vec3(1.0, 0.62, 0.36) * fx * fy * 1.0 * u_gate * u_gateOn;
    }
  }

  // threshold burst — crossing into the world of paint
  if (u_impact > 0.001) {
    float r = (1.0 - u_impact) * 1.4;
    float ring = exp(-pow((length(p0) - r) * 16.0, 2.0)) * u_impact * 1.6;
    col += vec3(1.0, 0.55, 0.45) * ring;
    col += vec3(1.0, 0.85, 0.65) * u_impact * u_impact * 1.4 * exp(-dot(p0, p0) * 2.2);
  }

  // the finale's linen — paint needs a canvas to dry on
  if (u_weave > 0.01) {
    vec2 wu = v_uv * asp * 220.0;
    float h = threads(wu);
    h = 0.75 + (h - 0.75) * 0.30;
    h += (fbm(v_uv * asp * 5.0) - 0.5) * 0.42;
    col *= mix(1.0, 0.55 + 0.5 * h, u_weave);
    col += vec3(0.93, 0.88, 0.80) * (0.02 + 0.05 * h) * u_weave;
  }

  // the dark answers the hand
  vec2 ppos = (u_pointer - 0.5) * asp;
  col += vec3(0.9, 0.7, 0.6) * 0.05 * exp(-dot(p0 - ppos, p0 - ppos) * 9.0);

  // breathing vignette
  float vig = smoothstep(1.45, 0.35, length(p0) + 0.06 * sin(u_time * 0.23));
  col *= 0.25 + 0.75 * vig;

  o = vec4(col, 1.0);
}`,

/* ------------------------------------------------------------------
   THE TOUCH — a celestial hand of starlight reaches for a ball of
   light; the light turns out to be Earth; contact zooms us in.
------------------------------------------------------------------- */
touchFS: /* glsl */`
in v2 v_uvDECL
uniform vec2 u_res;
uniform float u_time;
uniform float u_on;       // master visibility
uniform float u_reach;    // 0..1 hand travel
uniform float u_earth;    // 0..1 growth ramp — Earth from the first frame
uniform float u_zoomIn;   // 0..1 contact -> infinite zoom
uniform vec2 u_handOff;   // pointer lead: the hand follows the visitor's intent
uniform float u_energy;   // pointer velocity -> sparkle excitement
out vec4 o;

float sdCapsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float handSDF(vec2 q){
  // q in hand-local space: +x runs wrist -> fingertip, y up. Side view,
  // matching the client reference: index extended with a gentle downward
  // relax at the tip; middle/ring/pinky curled UNDER the palm as stacked
  // hooks whose knuckles step back in an arc; thumb lying diagonally
  // across the curled fingers; slim wrist flaring into a forearm that
  // dissolves into stardust past x ~ -0.3.
  // -- wrist & forearm --
  float d = sdCapsule(q, vec2(-0.600, -0.020), vec2(-0.360, -0.005), 0.088); // forearm flare
  d = min(d, sdCapsule(q, vec2(-0.340, -0.005), vec2(-0.200,  0.005), 0.060)); // slim wrist
  // -- palm --
  d = min(d, sdCapsule(q, vec2(-0.170,  0.012), vec2( 0.050,  0.038), 0.054)); // back-of-hand line: wrist -> index knuckle
  d = min(d, sdCapsule(q, vec2(-0.150, -0.028), vec2(-0.020, -0.022), 0.055)); // palm heel / body mass
  // -- index: two phalanx segments, tip relaxing slightly downward --
  d = min(d, sdCapsule(q, vec2( 0.070,  0.052), vec2( 0.210,  0.056), 0.024)); // proximal, near-level
  d = min(d, sdCapsule(q, vec2( 0.210,  0.056), vec2( 0.345,  0.038), 0.018)); // distal, relaxed droop
  // -- middle / ring / pinky: each a 2-capsule hook curled under,
  //    knuckles stepping down-and-back in an arc --
  d = min(d, sdCapsule(q, vec2( 0.075,  0.018), vec2( 0.135, -0.020), 0.025)); // middle proximal
  d = min(d, sdCapsule(q, vec2( 0.135, -0.020), vec2( 0.115, -0.070), 0.021)); // middle folds under
  d = min(d, sdCapsule(q, vec2( 0.045, -0.012), vec2( 0.105, -0.048), 0.023)); // ring proximal
  d = min(d, sdCapsule(q, vec2( 0.105, -0.048), vec2( 0.082, -0.094), 0.019)); // ring folds under
  d = min(d, sdCapsule(q, vec2( 0.012, -0.042), vec2( 0.062, -0.072), 0.019)); // pinky proximal
  d = min(d, sdCapsule(q, vec2( 0.062, -0.072), vec2( 0.040, -0.108), 0.015)); // pinky folds under
  // -- thumb: diagonal across the curled fingers, tip near the folded middle --
  d = min(d, sdCapsule(q, vec2(-0.050, -0.040), vec2( 0.045, -0.075), 0.030)); // thumb proximal
  d = min(d, sdCapsule(q, vec2( 0.045, -0.075), vec2( 0.125, -0.088), 0.022)); // thumb distal
  return d;
}

float starsIn(vec2 sp){
  vec2 cell = floor(sp);
  float st = step(0.975, hash21(cell));
  float sd = length(fract(sp) - 0.5 - (hash22(cell) - 0.5) * 0.6);
  return st * exp(-sd * sd * 150.0) * (0.6 + 0.4 * sin(u_time * 2.0 + hash21(cell) * 40.0));
}

void main(){
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 p = (v_uv - 0.5) * asp;

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // --- the world: EARTH, alive from the very first frame ---
  // composition breathes with the frame: landscape = side-by-side reach,
  // portrait = the hand climbs from the corner toward a high world
  float axm = smoothstep(0.55, 1.15, asp.x);
  vec2 orbHome = mix(vec2(0.06, 0.20), vec2(0.24, 0.05), axm);
  vec2 orbC = mix(orbHome, vec2(0.0, 0.0), smoothstep(0.0, 1.0, u_zoomIn));
  float R = mix(0.055, 0.165, smoothstep(0.0, 1.0, max(u_reach, u_earth)));
  float zk = smoothstep(0.0, 1.0, u_zoomIn);
  R *= 1.0 + zk * zk * 60.0;                     // the infinite zoom
  vec2 oq = (p - orbC) / R;
  float orR = length(oq);

  // soft atmospheric presence in the dark — a planet, not a lamp
  col += vec3(0.35, 0.55, 1.0) * exp(-orR * orR * 3.5) * 0.22;
  alpha = max(alpha, clamp(exp(-orR * orR * 3.5) * 0.5, 0.0, 1.0));

  if (orR < 1.15) {
    float z2 = 1.0 - orR * orR;
    if (z2 > 0.0) {
      // a living planet, painted procedurally
      float z = sqrt(z2);
      vec3 n = vec3(oq, z);
      float rotT = u_time * 0.016;
      vec3 ns = vec3(n.x * cos(rotT) - n.z * sin(rotT), n.y, n.x * sin(rotT) + n.z * cos(rotT));
      float land = fbm3(ns * 2.4 + 7.0);
      float landM = smoothstep(0.50, 0.56, land);
      vec3 ocean = mix(vec3(0.010, 0.075, 0.24), vec3(0.015, 0.17, 0.36), smoothstep(0.4, 0.6, fbm3(ns * 5.0)));
      vec3 terra = mix(vec3(0.06, 0.17, 0.08), vec3(0.30, 0.25, 0.13), smoothstep(0.45, 0.75, fbm3(ns * 4.0 + 31.0)));
      vec3 surf = mix(ocean, terra, landM);
      float clouds = smoothstep(0.52, 0.66, fbm3(ns * 3.6 + vec3(u_time * 0.02, 0.0, 0.0)));
      surf = mix(surf, vec3(1.0), clouds * 0.85);
      vec3 L = normalize(vec3(0.45, 0.35, 0.75));
      float diff = clamp(dot(n, L), 0.0, 1.0);
      float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 42.0) * (1.0 - landM) * (1.0 - clouds) * 0.9;
      vec3 earthCol = surf * (0.12 + 1.05 * diff) + vec3(1.0, 0.95, 0.85) * spec;
      earthCol += vec3(0.25, 0.5, 1.0) * pow(1.0 - z, 2.6) * 0.9;      // atmosphere
      float edge = smoothstep(1.0, 0.985, orR);
      col = mix(col, earthCol, edge);
      alpha = max(alpha, edge);
    }
    // atmosphere limb
    float limb = exp(-abs(orR - 1.0) * 26.0);
    col += vec3(0.35, 0.6, 1.0) * limb * 0.9;
    alpha = max(alpha, limb * 0.8);
  }

  // --- the hand: a nebula wearing the shape of a hand ---
  float handOn = 1.0 - smoothstep(0.55, 0.95, u_zoomIn);
  if (handOn > 0.003) {
    // wrist anchored low-left; the hand leans where the visitor leads it,
    // and always, ultimately, toward the world
    vec2 aim = orbC + u_handOff;
    vec2 start = mix(vec2(-0.34, -0.46), vec2(-0.74, -0.17), axm);   // corner-climb on portrait, level reach on landscape
    vec2 dir = normalize(aim - start);
    float travel = mix(0.0, 0.86, smoothstep(0.0, 1.0, u_reach));
    vec2 root = start + dir * travel * 0.46;
    float scale = mix(0.42, 0.62, axm);
    vec2 hq = (p - root) / scale;
    hq = mat2(dir.x, -dir.y, dir.y, dir.x) * hq;
    float hd = handSDF(hq);

    // translucent body of light — defined silhouette, glow halo beyond it
    float body = smoothstep(0.008, -0.022, hd);
    float halo = exp(-max(hd, 0.0) * 26.0);

    // nebula filaments stretched along the limb: blue plasma, gold veins
    vec2 fq = vec2(hq.x * 2.1, hq.y * 5.2);
    float fil1 = 1.0 - abs(2.0 * fbm(fq * 2.0 + u_time * 0.05) - 1.0);
    float fil2 = 1.0 - abs(2.0 * fbm(fq * 3.8 - u_time * 0.04 + 7.0) - 1.0);
    vec3 handCol = vec3(0.010, 0.013, 0.034);
    handCol += vec3(0.26, 0.42, 0.98) * pow(clamp(fil1, 0.0, 1.0), 3.0) * 0.55;
    handCol += vec3(1.0, 0.70, 0.32) * pow(clamp(fil2, 0.0, 1.0), 4.0) * 0.75;
    handCol += vec3(0.50, 0.32, 0.72) * fbm(hq * 3.0 + 13.0) * 0.22;

    // starlight flesh — two scales of stars + wandering cross-flares
    handCol += vec3(0.90, 0.90, 1.0) * starsIn(hq * 42.0) * 1.1;
    handCol += vec3(1.0, 0.95, 0.80) * starsIn(hq * 17.0 + 5.0) * 1.5;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 sp = vec2(-0.42 + fi * 0.21 + 0.03 * sin(u_time * 0.5 + fi * 2.1),
                     -0.05 + 0.07 * sin(u_time * 0.34 + fi * 4.0));
      vec2 dd = hq - sp;
      float tw2 = 0.4 + 0.6 * (0.5 + 0.5 * sin(u_time * (1.2 + fi * 0.7) + fi * 9.0));
      float fl = exp(-dot(dd, dd) * 800.0) * 2.0
               + (exp(-abs(dd.x) * 110.0) * exp(-abs(dd.y) * 20.0)
                + exp(-abs(dd.y) * 110.0) * exp(-abs(dd.x) * 20.0)) * 0.8;
      handCol += vec3(1.0, 0.92, 0.78) * fl * tw2 * (0.42 + u_energy * 0.5);
    }

    // the arm dissolves into drifting stardust behind the wrist
    float behind = smoothstep(-0.28, -0.95, hq.x);
    float plume = behind * pow(max(fbm(vec2(hq.x * 2.0 - u_time * 0.09, hq.y * 4.6)) - 0.34, 0.0), 1.5);
    plume *= exp(-abs(hq.y) * 2.2);
    vec3 plumeCol = (vec3(0.30, 0.42, 0.95) + vec3(1.0, 0.72, 0.35) * fbm(hq * 5.0 + 3.0)) * plume * 0.8;

    // burning golden fingertip
    vec2 tipL = vec2(0.352, 0.037);   // index fingertip in hand-local space
    float tipD = length(hq - tipL);
    handCol += vec3(1.0, 0.80, 0.45) * exp(-tipD * tipD * 240.0) * (1.8 + u_energy * 1.6 + u_reach * 1.4);

    // rim light toward the world it reaches for — thin, defining, not flooding
    float rim = exp(-abs(hd) * 110.0);
    handCol += vec3(1.0, 0.75, 0.45) * rim * (0.35 + 0.3 * u_reach);

    // dark celestial flesh with luminous seams: reads as a hand, not a comet
    vec3 handOut = handCol * body + vec3(0.55, 0.50, 0.70) * halo * 0.045 + plumeCol;
    col += handOut * handOn;
    alpha = max(alpha, clamp(body * 0.9 + halo * 0.18 + plume, 0.0, 1.0) * handOn);

    // --- the spark of contact ---
    float near = smoothstep(0.82, 0.98, u_reach) * handOn;
    if (near > 0.003) {
      vec2 tip = root + mat2(dir.x, dir.y, -dir.y, dir.x) * (tipL * scale);
      vec2 toTip = tip - orbC;
      vec2 target = orbC + toTip / max(length(toTip), 1e-4) * min(R, 0.16);
      vec2 seg = target - tip;
      float bolt = 0.0;
      for (int i = 1; i < 7; i++) {
        float t = float(i) / 7.0;
        vec2 pt = tip + seg * t;
        pt += vec2(vnoise(vec2(t * 14.0, u_time * 26.0)) - 0.5, vnoise(vec2(t * 17.0 + 9.0, u_time * 24.0)) - 0.5) * 0.016;
        bolt += exp(-length(p - pt) * 240.0);
      }
      col += vec3(1.0, 0.9, 0.7) * bolt * near * 2.6;
      col += vec3(1.0, 0.8, 0.5) * exp(-length(p - tip) * 60.0) * near * 0.9;
      alpha = max(alpha, clamp(bolt, 0.0, 1.0) * near);
    }
  }

  // contact flash → hand over to the sky
  float flash = smoothstep(0.55, 1.0, u_zoomIn);
  col = mix(col, vec3(0.62, 0.78, 1.0), flash * 0.9);
  alpha = max(alpha, flash * 0.95);

  o = vec4(col, clamp(alpha, 0.0, 1.0)) * u_on;
}`,

/* ------------------------------------------------------------------
   THE FLIGHT — daytime raymarched city under a blue sky.
   Real 3D towers, procedural, zero assets: fly any idea.
------------------------------------------------------------------- */
cityFS: /* glsl */`
in v2 v_uvDECL
uniform vec2 u_res;
uniform float u_time;
uniform float u_on;       // opacity
uniform float u_fly;      // 0..1 journey through the city
uniform float u_dusk;     // 0..1 hand-off to the dark
uniform float u_steps;    // ray budget by tier
uniform vec2 u_pointer;
out vec4 o;

const float CELL = 46.0;
const vec3 SUN = normalize(vec3(0.10, 0.062, -1.0));   // golden hour, dead ahead
const float SHORE = -1780.0;                            // the island ends; water begins

float sdCap(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

vec2 buildingAt(vec2 id){
  float h1 = hash21(id);
  float h2 = hash21(id + 19.7);
  float district = fbm(id * 0.11);                        // midtown clusters
  float h = (14.0 + pow(h1, 1.6) * 150.0) * (0.35 + 1.3 * district);
  float w = 9.0 + h2 * 7.5;
  return vec2(h, w);
}

float map(vec3 p){
  if (p.z < SHORE) return p.y;                            // open water
  vec2 id = floor(p.xz / CELL);
  vec2 q = mod(p.xz, CELL) - CELL * 0.5;
  vec2 bw = buildingAt(id);
  // carve the flight canyon: towers shrink along the camera's path
  float pathX = sin(-p.z * 0.0021) * 55.0;
  float canyon = 0.20 + 0.80 * smoothstep(26.0, 85.0, abs(p.x - pathX));
  // the city thins out into the harbor
  float coast = smoothstep(SHORE + 30.0, SHORE + 430.0, p.z);
  float h = bw.x * canyon * coast;
  if (h < 2.5) return p.y;
  vec3 b = vec3(bw.y, h, bw.y * (0.8 + 0.4 * hash21(id + 7.3)));
  vec3 dp = vec3(q.x, p.y - b.y, q.y);
  vec3 dd = abs(dp) - b;
  float bld = length(max(dd, 0.0)) + min(max(dd.x, max(dd.y, dd.z)), 0.0);
  return min(bld, p.y);                                   // streets at y=0
}

vec3 skyColor(vec3 rd){
  float up = clamp(rd.y, 0.0, 1.0);
  // sunset stack: molten horizon → gold → dusty rose → violet-blue night
  vec3 sky = mix(vec3(1.00, 0.44, 0.15), vec3(1.0, 0.70, 0.34), clamp(up * 4.5, 0.0, 1.0));
  sky = mix(sky, vec3(0.62, 0.35, 0.47), smoothstep(0.08, 0.40, up));
  sky = mix(sky, vec3(0.10, 0.12, 0.34), smoothstep(0.32, 0.95, up));
  float sunD = clamp(dot(rd, SUN), 0.0, 1.0);
  sky += vec3(1.0, 0.80, 0.45) * pow(sunD, 900.0) * 4.0;   // the disc
  sky += vec3(1.0, 0.55, 0.22) * pow(sunD, 20.0) * 0.9;    // corona
  sky += vec3(1.0, 0.45, 0.20) * pow(sunD, 4.0) * 0.30;    // sky-wide warmth
  if (rd.y > 0.015) {
    vec2 cp = rd.xz / (rd.y + 0.10) * 1.4;
    float cl = fbm(cp + vec2(u_time * 0.010, 0.0));
    float cum = smoothstep(0.44, 0.75, cl);
    vec3 lit = vec3(1.0, 0.60, 0.38) * 1.2;               // undersides on fire
    vec3 shade = vec3(0.36, 0.26, 0.42);
    sky = mix(sky, mix(shade, lit, pow(clamp(sunD + 0.35, 0.0, 1.0), 3.0)), cum * smoothstep(0.0, 0.10, rd.y) * 0.92);
  }
  // dusk hand-off: the day burns down into the paint-dark
  vec3 duskSky = mix(vec3(0.09, 0.025, 0.09), vec3(0.02, 0.02, 0.05), pow(up, 0.6));
  duskSky += vec3(1.0, 0.32, 0.18) * pow(sunD, 10.0) * 0.45;
  return mix(sky, duskSky, u_dusk);
}

void main(){
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0) * 2.0;

  // the five-panel journey: canyon → dive → rooftops → coastline → open water
  float f = u_fly;
  float dist = f * 2400.0;
  float hgt = 76.0
    - 34.0 * smoothstep(0.10, 0.28, f)      // dive down the avenue
    + 96.0 * smoothstep(0.32, 0.55, f)      // rise over the rooftops
    - 92.0 * smoothstep(0.62, 0.88, f);     // sink toward the sunset water
  vec3 ro = vec3(
    sin(dist * 0.0021) * 55.0 + (u_pointer.x - 0.5) * 26.0,
    hgt + sin(dist * 0.0037) * 10.0 + (u_pointer.y - 0.5) * 12.0,
    -dist
  );
  float bank = sin(dist * 0.0021 + 1.2) * 0.10;
  float pitch = -0.055 + 0.11 * smoothstep(0.32, 0.55, f) - 0.10 * smoothstep(0.62, 0.88, f);
  vec3 fwd = normalize(vec3(cos(dist * 0.0021) * 0.10, pitch, -1.0));
  vec3 right = normalize(cross(fwd, vec3(sin(bank), cos(bank), 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(fwd + uv.x * right * 0.62 + uv.y * up * 0.62);

  float t = 0.0;
  float hit = -1.0;
  for (int i = 0; i < 144; i++) {
    if (float(i) >= u_steps) break;
    vec3 pos = ro + rd * t;
    float d = map(pos);
    if (d < 0.0012 * t + 0.03) { hit = t; break; }
    // clamp the stride to the grid scale: neighbor towers can be closer
    // than this cell's SDF admits (non-Lipschitz across cell borders)
    t += min(d * 0.86, 26.0);
    if (t > 1900.0) break;
  }

  vec3 col;
  if (hit > 0.0) {
    vec3 pos = ro + rd * hit;
    vec2 e = vec2(0.35, 0.0);
    vec3 n = normalize(vec3(
      map(pos + e.xyy) - map(pos - e.xyy),
      map(pos + e.yxy) - map(pos - e.yxy),
      map(pos + e.yyx) - map(pos - e.yyx)));
    vec2 id = floor(pos.xz / CELL);
    vec2 bw = buildingAt(id);
    float diff = clamp(dot(n, SUN), 0.0, 1.0);
    float skyAmb = 0.35 + 0.35 * clamp(n.y, 0.0, 1.0);
    bool water = pos.z < SHORE + 4.0 && n.y > 0.5 && pos.y < 2.5;
    if (water) {
      // the harbor: burning sky mirrored in slow water
      vec2 wq = pos.xz * 0.045;
      float e2 = 0.07;
      float w0 = fbm(wq + u_time * 0.13);
      vec3 nw = normalize(vec3((w0 - fbm(wq + vec2(e2, 0.0) + u_time * 0.13)) * 2.4, 1.0,
                               (w0 - fbm(wq + vec2(0.0, e2) + u_time * 0.13)) * 2.4));
      vec3 R = reflect(rd, nw);
      R.y = abs(R.y);
      col = skyColor(R) * 0.82;
      col += vec3(1.0, 0.66, 0.30) * pow(clamp(dot(R, SUN), 0.0, 1.0), 80.0) * 3.2;   // the sun road
      col = mix(col, vec3(0.06, 0.07, 0.12), 0.18);
    } else if (abs(n.y) < 0.5) {
      // facade: crisp window grid on the face's own axis, interiors waking up
      float along = abs(n.x) > abs(n.z) ? pos.z : pos.x;
      float cellY = floor(pos.y * 0.36);
      float cellX = floor(along * 0.42);
      float bandY = step(0.38, fract(pos.y * 0.36));
      float bandX = step(0.30, fract(along * 0.42));
      float glass = bandY * bandX;
      float bldHash = hash21(id + 3.1);
      if (bldHash > 0.72) glass = 1.0;                     // full glass towers
      vec3 tint = mix(vec3(0.60, 0.52, 0.46), vec3(0.50, 0.50, 0.56), step(0.5, bldHash));
      vec3 concrete = tint * (0.22 + 0.78 * diff) * (0.55 + 0.45 * clamp(pos.y / bw.x, 0.0, 1.0));
      concrete *= mix(vec3(0.72, 0.72, 0.9), vec3(1.15, 0.92, 0.72), diff);   // violet shade, golden sun
      vec3 ref = skyColor(reflect(rd, n));
      vec3 glassCol = ref * (0.5 + 0.25 * bldHash)
        + vec3(1.0, 0.8, 0.5) * pow(clamp(dot(reflect(rd, n), SUN), 0.0, 1.0), 60.0) * 2.2;
      // lit interiors — the city coming home at dusk
      float lit = step(0.60, hash21(vec2(cellX, cellY) + id * 3.7));
      glassCol += vec3(1.0, 0.72, 0.38) * lit * (0.5 + 0.5 * hash21(vec2(cellY, cellX))) * (0.5 + 0.9 * u_dusk);
      col = mix(concrete, glassCol, glass * 0.88);
    } else if (n.y > 0.5 && pos.y > 2.0) {
      col = vec3(0.34, 0.30, 0.34) * (0.35 + 0.65 * diff);
      col += vec3(1.0, 0.6, 0.3) * diff * 0.18;            // roofs catching sun
    } else {
      // streets: asphalt threaded with headlight gold
      float lane = step(0.94, fract(pos.x / CELL + 0.5)) + step(0.94, fract(pos.z / CELL + 0.5));
      col = vec3(0.10, 0.09, 0.11) * (0.5 + 0.5 * diff) + vec3(1.0, 0.7, 0.35) * lane * 0.22;
    }
    col *= 0.9 + 0.2 * skyAmb;
    // sunset aerial perspective — haze glows toward the sun
    float toSun = pow(clamp(dot(rd, SUN), 0.0, 1.0), 3.0);
    vec3 haze = mix(mix(vec3(0.42, 0.30, 0.42), vec3(1.0, 0.55, 0.25), toSun), vec3(0.06, 0.03, 0.07), u_dusk);
    col = mix(col, haze, 1.0 - exp(-hit * 0.0009));
    col = mix(col, skyColor(rd), smoothstep(750.0, 1350.0, hit) * 0.85);
  } else {
    col = skyColor(rd);
  }

  // ---- speed: the world streaks past at the edges ----
  {
    float r2 = length(uv);
    float ang = atan(uv.y, uv.x);
    float rush = 0.30 + 0.9 * smoothstep(0.10, 0.24, f) * (1.0 - smoothstep(0.30, 0.46, f));
    float streak = pow(max(fbm(vec2(ang * 6.0, r2 * 3.0 - u_time * 5.5)) - 0.55, 0.0), 1.6);
    col += vec3(1.0, 0.72, 0.45) * streak * smoothstep(0.5, 1.2, r2) * rush;
  }

  o = vec4(col, 1.0) * u_on;
}`,

/* ------------------------------------------------------------------
   BEAMS — volumetric light shafts for the excavation of Act III.
------------------------------------------------------------------- */
beamsFS: /* glsl */`
in v2 v_uvDECL
uniform vec2 u_res;
uniform float u_time;
uniform float u_intensity;
uniform vec3 u_tint;
out vec4 o;
void main(){
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 p = (v_uv - vec2(0.5, 1.25)) * asp;      // source floats above the frame
  float ang = atan(p.x, -p.y);
  float d = length(p);
  float shafts = fbm(vec2(ang * 5.0, d * 0.6 - u_time * 0.05)) *
                 fbm(vec2(ang * 11.0 + 40.0, u_time * 0.03));
  shafts = pow(max(shafts, 0.0), 2.4);
  float fall = smoothstep(2.1, 0.25, d) * smoothstep(-0.1, 0.5, v_uv.y);
  vec3 col = u_tint * shafts * fall * u_intensity * 1.6;
  o = vec4(col, 1.0);
}`,

/* ------------------------------------------------------------------
   PORTALS — quads in space; each fragment shader is a small world.
------------------------------------------------------------------- */
portalVS: /* glsl */`
uniform mat4 u_viewProj;
uniform mat4 u_model;
uniform vec3 u_camPos;
out vec2 v_uv;
out vec3 v_view;
const vec2 QUAD[6] = vec2[6](
  vec2(-0.5,-0.5), vec2(0.5,-0.5), vec2(0.5,0.5),
  vec2(-0.5,-0.5), vec2(0.5,0.5), vec2(-0.5,0.5)
);
void main(){
  vec2 q = QUAD[gl_VertexID];
  v_uv = q + 0.5;
  vec4 world = u_model * vec4(q, 0.0, 1.0);
  v_view = normalize(world.xyz - u_camPos);
  gl_Position = u_viewProj * world;
}`,

portalFS: /* glsl */`
in vec2 v_uv;
in vec3 v_view;
uniform float u_time;
uniform int u_world;
uniform float u_fog;        // 0 = crisp, 1 = swallowed by depth
uniform float u_reveal;     // scroll-in
uniform vec3 u_edgeCol;
uniform float u_aspect;     // quad w/h
out vec4 o;

vec3 nebula(vec2 uv, vec2 par){
  vec3 col = vec3(0.012, 0.010, 0.030);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 q = uv * (1.6 + fi * 1.1) + par * (0.5 + fi * 0.45) + fi * 13.7;
    float d = fbm3(vec3(q * 2.2, u_time * 0.04 + fi));
    d = smoothstep(0.32, 0.85, d);
    vec3 tint = mix(vec3(0.75, 0.12, 0.40), vec3(0.30, 0.16, 0.85), fi * 0.5);
    col += tint * d * (0.5 - fi * 0.12);
  }
  vec2 sp = (uv + par * 1.4) * 26.0;
  vec2 cell = floor(sp);
  float star = step(0.985, hash21(cell));
  vec2 off = hash22(cell) - 0.5;
  float sd = length(fract(sp) - 0.5 - off * 0.6);
  col += star * exp(-sd * sd * 260.0) * (0.7 + 0.5 * sin(u_time * 3.0 + hash21(cell) * 40.0)) * vec3(0.9, 0.95, 1.0) * 1.6;
  return col;
}

vec3 tide(vec2 uv, vec2 par){
  // liquid-metal ocean: ray from a fixed interior camera onto a wavy plane
  vec3 ro = vec3(par * 0.5, 1.2);
  vec3 rd = normalize(vec3(uv - vec2(0.5, 0.62), -1.0));
  vec3 sky = mix(vec3(0.02, 0.015, 0.02), vec3(1.0, 0.55, 0.22), pow(max(0.0, 1.0 - abs(uv.y - 0.62) * 2.4), 3.0) * 0.8);
  if (rd.y > -0.02) return sky * 0.8;
  float t = (-0.35 - ro.y) / rd.y;
  vec2 hp = ro.xz + rd.xz * t;
  float e = 0.05;
  float h0 = fbm(hp * 2.0 + vec2(u_time * 0.22, 0.0));
  float hx = fbm((hp + vec2(e, 0.0)) * 2.0 + vec2(u_time * 0.22, 0.0));
  float hz = fbm((hp + vec2(0.0, e)) * 2.0 + vec2(u_time * 0.22, 0.0));
  vec3 N = normalize(vec3((h0 - hx) / e * 0.24, 1.0, (h0 - hz) / e * 0.24));
  vec3 R = reflect(rd, N);
  vec3 sun = normalize(vec3(0.2, 0.16, -1.0));
  float spec = pow(max(dot(R, sun), 0.0), 60.0) * 3.0;
  float horiz = pow(max(dot(R, vec3(0.0, 0.12, -1.0)), 0.0), 4.0);
  vec3 col = vec3(0.03, 0.028, 0.03) + vec3(1.0, 0.62, 0.28) * (spec + horiz * 0.55);
  col += vec3(0.45, 0.42, 0.48) * pow(1.0 - max(dot(-rd, N), 0.0), 3.0) * 0.4; // fresnel silver
  float fade = exp(-t * 0.16);
  return mix(sky * 0.55, col, fade);
}

// palm frond: arcing rachis with pinnate leaflets fanning off both sides
float frond(vec2 q, float ang, float len, float droop){
  float c = cos(ang), s = sin(ang);
  q = mat2(c, s, -s, c) * q;
  if (q.x < 0.0 || q.x > len * 1.12) return 0.0;
  q.y += q.x * q.x * droop;                          // gravity arc of the rachis
  float t = clamp(q.x / len, 0.0, 1.0);
  float yy = abs(q.y);
  // rachis: thin spine, thicker petiole at the crown
  float rw = mix(0.0065, 0.0016, t);
  float m = smoothstep(rw, rw * 0.45, yy);
  // leaflets: skewed periodic coordinate stamps thin triangles at 55->41 deg off the spine
  float span = len * 0.36;                           // longest leaflet
  if (yy < span) {
    float k = mix(0.70, 1.15, t);                    // cot(55deg) at base -> cot(41deg) near tip
    float u = q.x - yy * k + yy * yy * (0.3 + 1.2 * t) * droop; // leaflet tips curl back along the arc
    float P = len / 16.0;                            // leaflet spacing
    float id = floor(u / P);
    float tb = (id + 0.5) * P / len;                 // spine position of this leaflet's base
    float L = span * smoothstep(0.02, 0.14, tb) * max(1.08 - tb, 0.0); // bare petiole, taper to tip
    L = max(L * (0.80 + 0.40 * hash11(id + ang * 7.31)), 1e-3);        // organic per-leaflet variation
    float cu = abs(fract(u / P) - 0.5) * P;          // distance to leaflet midline
    float h = P * 0.34 * (1.0 - yy / L) + 6.0e-4;    // triangle: wide at base -> needle point
    m = max(m, smoothstep(h, h * 0.35, cu) * smoothstep(L, L * 0.8, yy));
  }
  return m;
}

vec3 eden(vec2 uv, vec2 par){
  float horizon = 0.44;
  // golden-hour sky: coral low, gold mid, teal zenith
  vec3 sky = mix(vec3(1.0, 0.46, 0.24), vec3(1.0, 0.78, 0.38), clamp((uv.y - horizon) * 2.4, 0.0, 1.0));
  sky = mix(sky, vec3(0.22, 0.62, 0.58), smoothstep(0.68, 1.05, uv.y));
  vec2 sunp = uv - vec2(0.5 + par.x * 0.2, horizon + 0.13);
  float sun = exp(-dot(sunp, sunp) * 130.0);
  vec3 col = sky + vec3(1.0, 0.68, 0.32) * sun * 1.9;
  col += vec3(1.0, 0.55, 0.30) * exp(-dot(sunp, sunp) * 14.0) * 0.7;   // haze halo
  // drifting clouds catching fire
  float cl = fbm(vec2(uv.x * 3.0 - u_time * 0.02, uv.y * 8.0));
  col += vec3(1.0, 0.5, 0.35) * pow(max(cl - 0.55, 0.0), 1.4) * smoothstep(horizon, horizon + 0.3, uv.y) * 2.2;
  if (uv.y < horizon) {
    // turquoise lagoon with a burning sun-path
    float d = horizon - uv.y;
    vec3 sea = mix(vec3(0.06, 0.55, 0.52), vec3(0.01, 0.20, 0.30), smoothstep(0.0, 0.42, d));
    float sparkle = fbm(vec2(uv.x * 44.0, d * 150.0 - u_time * 1.1));
    float path = exp(-abs(uv.x - 0.5 - par.x * 0.2) * 9.0 / (0.18 + d * 3.5));
    sea += vec3(1.0, 0.80, 0.48) * pow(sparkle, 3.0) * path * 2.0;
    sea += vec3(0.9, 0.6, 0.4) * path * 0.25 / (1.0 + d * 14.0);
    col = sea;
  }
  // palm silhouettes leaning in from the edges
  float palm = 0.0;
  vec2 t1 = vec2(0.13 + par.x * 0.35, 0.30);   // crown of palm 1
  vec2 q1 = uv - t1;
  palm += smoothstep(0.014, 0.006, abs(uv.x - (t1.x - 0.05) - pow(max(t1.y + 0.5 - uv.y, 0.0), 2.0) * 0.22)) * step(uv.y, t1.y) * step(-0.55, uv.y - t1.y);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float ang = -1.25 + fi * 0.42 + 0.04 * sin(u_time * 0.7 + fi);
    palm += frond(q1, ang, 0.19 + 0.06 * hash11(fi + 2.0), 1.7 - fi * 0.11);
  }
  vec2 t2 = vec2(0.90 + par.x * 0.45, 0.42);   // taller palm, right
  vec2 q2 = uv - t2;
  palm += smoothstep(0.016, 0.007, abs(uv.x - (t2.x + 0.06) + pow(max(t2.y + 0.6 - uv.y, 0.0), 2.0) * 0.20)) * step(uv.y, t2.y);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float ang = 1.75 + fi * 0.38 + 0.04 * sin(u_time * 0.6 + fi * 1.7);
    palm += frond(q2, ang, 0.21 + 0.06 * hash11(fi + 9.0), 0.95 + fi * 0.10);
  }
  palm = clamp(palm, 0.0, 1.0);
  col = mix(col, vec3(0.012, 0.030, 0.020), palm);
  // pollen / spray motes drifting in the light
  vec2 mp = uv * 26.0 + vec2(u_time * 0.3, sin(u_time * 0.4));
  float mote = step(0.992, hash21(floor(mp))) * exp(-length(fract(mp) - 0.5) * 8.0);
  col += vec3(1.0, 0.85, 0.55) * mote * 0.8;
  return col;
}

vec3 aurora(vec2 uv, vec2 par){
  vec3 col = vec3(0.008, 0.012, 0.030);
  vec2 sp = (uv + par) * 20.0;
  vec2 cell = floor(sp);
  float star = step(0.98, hash21(cell));
  float sd = length(fract(sp) - 0.5);
  col += star * exp(-sd * sd * 200.0) * 0.9;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wx = uv.x * (2.2 + fi * 0.6) + fbm(vec2(uv.x * 2.0 + fi * 7.0, uv.y * 0.8 + u_time * (0.10 + fi * 0.03))) * 2.2 + par.x * (0.8 + fi * 0.3);
    float sv = sin(wx * 3.1415) * 1.6;                 // manual square: pow of a negative is undefined
    float band = exp(-sv * sv * (2.6 - fi * 0.5));
    float vert = smoothstep(0.05, 0.45, uv.y) * smoothstep(1.05, 0.55, uv.y + fi * 0.06);
    float shimmer = 0.7 + 0.3 * fbm(vec2(wx * 3.0, uv.y * 6.0 - u_time * 0.5));
    vec3 tint = mix(vec3(0.10, 0.95, 0.60), vec3(0.45, 0.25, 0.95), fi * 0.5 + uv.y * 0.3);
    col += tint * band * vert * shimmer * (0.5 - fi * 0.11);
  }
  return col;
}

void main(){
  // interior parallax: the world sits behind the frame
  vec2 par = v_view.xy * 0.35;
  vec2 uv = v_uv;

  // rounded-rect frame
  vec2 q = (uv - 0.5) * vec2(u_aspect, 1.0);
  vec2 b = vec2(u_aspect, 1.0) * 0.5 - 0.035;
  vec2 dq = abs(q) - b + 0.06;
  float rr = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - 0.06;

  vec3 col;
  if      (u_world == 0) col = nebula(uv, par);
  else if (u_world == 1) col = tide(uv, par);
  else if (u_world == 2) col = eden(uv, par);
  else                   col = aurora(uv, par);

  // reveal: world floods the frame from the center like developing film
  float rev = smoothstep(0.0, 1.0, u_reveal);
  float irisR = rev * 1.4;
  col *= (1.0 - smoothstep(max(irisR - 0.30, 0.0), irisR, length(q))) * rev;

  float inside = smoothstep(0.004, -0.004, rr);
  float edge = exp(-abs(rr) * 120.0);
  col = col * inside + u_edgeCol * edge * (0.7 + 0.3 * sin(u_time * 1.7)) * rev;

  col *= 1.0 - u_fog;
  float a = max(inside, edge) * (1.0 - u_fog);
  o = vec4(col, a);
}`,

/* ------------------------------------------------------------------
   THE MARK — two brushstrokes sign the canvas in real time.
------------------------------------------------------------------- */
markFS: /* glsl */`
in v2 v_uvDECL
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_a[4];       // stroke A control points (mark space)
uniform vec2 u_b[4];       // stroke B
uniform float u_progA;     // 0..1 paint progress of each stroke
uniform float u_progB;
uniform float u_scale;
uniform float u_glow;
out vec4 o;

// distance + arc-param along a polyline of 4 points
vec3 strokeField(vec2 p, vec2 pts[4]){
  float best = 1e9, bestT = 0.0, acc = 0.0, total = 0.0;
  for (int i = 0; i < 3; i++) total += length(pts[i+1] - pts[i]);
  for (int i = 0; i < 3; i++) {
    vec2 a = pts[i], b = pts[i+1];
    vec2 ab = b - a;
    float len = length(ab);
    float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = length(p - a - ab * h);
    if (d < best) { best = d; bestT = (acc + h * len) / total; }
    acc += len;
  }
  return vec3(best, bestT, total);
}

vec3 paintStroke(vec2 p, vec2 pts[4], float prog, float w0, float w1, out float tipGlow){
  vec3 f = strokeField(p, pts);
  float t = f.y;
  float width = mix(w0, w1, t) * (0.85 + 0.3 * fbm(vec2(t * 9.0, 3.0)));
  // bristles: erode edges along the travel direction
  float bristle = fbm(vec2(t * 60.0, f.x * 90.0)) * 0.35;
  float edge = width * (1.0 - bristle);
  float reveal = smoothstep(prog + 0.015, prog - 0.02, t);   // painted so far
  float body = smoothstep(edge, edge * 0.35, f.x) * reveal;
  // wet sheen in the fresh paint
  float sheen = smoothstep(edge * 0.5, 0.0, f.x) * smoothstep(prog - 0.22, prog, t) * reveal;
  vec3 col = mix(vec3(1.0, 0.18, 0.39), vec3(1.0, 0.70, 0.28), t);
  col = col * (body * (1.15 + sheen * 1.3));
  tipGlow = exp(-abs(t - prog) * 26.0) * exp(-f.x * f.x * 300.0) * step(0.005, prog) * step(prog, 0.995);
  return col * u_glow;
}

void main(){
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 p = (v_uv - 0.5) * asp / u_scale;
  float tipA, tipB;
  vec3 colA = (u_progA > 0.001) ? paintStroke(p, u_a, u_progA, 0.085, 0.05, tipA) : vec3(0.0);
  if (u_progA <= 0.001) tipA = 0.0;
  vec3 colB = (u_progB > 0.001) ? paintStroke(p, u_b, u_progB, 0.05, 0.022, tipB) : vec3(0.0);
  if (u_progB <= 0.001) tipB = 0.0;
  vec3 col = max(colA, colB);
  col += vec3(1.0, 0.6, 0.5) * (tipA + tipB) * 1.4;   // molten tip feeds the bloom
  float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
  o = vec4(col, a);
}`,

/* ------------------------------------------------------------------
   TEXT QUADS — canvas-rendered type living inside the world.
------------------------------------------------------------------- */
textVS: /* glsl */`
uniform mat4 u_viewProj;
uniform mat4 u_model;
out vec2 v_uv;
const vec2 QUAD[6] = vec2[6](
  vec2(-0.5,-0.5), vec2(0.5,-0.5), vec2(0.5,0.5),
  vec2(-0.5,-0.5), vec2(0.5,0.5), vec2(-0.5,0.5)
);
void main(){
  vec2 q = QUAD[gl_VertexID];
  v_uv = vec2(q.x + 0.5, 0.5 - q.y);
  gl_Position = u_viewProj * u_model * vec4(q, 0.0, 1.0);
}`,

textFS: /* glsl */`
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec3 u_color;
uniform float u_opacity;
uniform float u_reveal;    // brush-in sweep, 0..1 (1.15 = fully painted)
uniform float u_time;
out vec4 o;
void main(){
  float a = texture(u_tex, v_uv).a;
  float n = fbm(v_uv * vec2(6.0, 3.0)) * 0.18;
  // paints on left→right as u_reveal crosses each column
  float sweep = smoothstep(v_uv.x + n - 0.10, v_uv.x + n, u_reveal * 1.12);
  a *= sweep * u_opacity;
  o = vec4(u_color * a, a);
}`,
};

// tiny preprocessor: shared fullscreen shaders want `in vec2 v_uv;`
for (const k of Object.keys(WORLD)) {
  WORLD[k] = WORLD[k].replace('in v2 v_uvDECL', 'in vec2 v_uv;');
}
