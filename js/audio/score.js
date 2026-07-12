// Generative score — no audio files, only synthesis. Opt-in, elegant,
// never autoplay. A slow pad that re-voices per act, air tied to scroll
// velocity, pentatonic chimes for story rewards, one sub-boom for impact.

const CHORDS = [
  [110.0, 164.81, 220.0],    // I   the gates — bare fifth
  [130.81, 196.0, 329.63],   // II  the touch — C lift, suspended
  [174.61, 261.63, 440.0],   // III the flight — F major, open air
  [110.0, 261.63, 329.63],   // IV  the spark — Am lifted
  [87.31, 220.0, 329.63],    // V   the craft — F colour
  [146.83, 220.0, 369.99],   // VI  the worlds — D dream
  [110.0, 329.63, 440.0],    // VII the signature — home, wide
];
const PENTA = [440.0, 523.25, 587.33, 659.25, 783.99];

export class Score {
  constructor() {
    this.enabled = false;
    this.ctx = null;
  }

  async enable() {
    if (!this.ctx) this._build();
    await this.ctx.resume();
    this.enabled = true;
    this.master.gain.setTargetAtTime(0.42, this.ctx.currentTime, 1.2);
  }
  disable() {
    if (!this.ctx) return;
    this.enabled = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  _build() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    // generated impulse response — a room made of static
    const len = ctx.sampleRate * 2.8;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.5;
    this.verb.connect(this.verbGain).connect(this.master);

    // pad
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 420;
    this.filter.Q.value = 0.6;
    const padBus = ctx.createGain();
    padBus.gain.value = 0.045;          // a quiet bed — update() breathes it
    padBus.connect(this.filter);
    this.padBus = padBus;
    this.filter.connect(this.master);
    this.filter.connect(this.verb);
    this.oscs = CHORDS[0].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 4;
      const g = ctx.createGain();
      g.gain.value = 0.5 - i * 0.12;
      o.connect(g).connect(padBus);
      o.start();
      return o;
    });

    // air — scroll-speed noise
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = nb; noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.8;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;
    noise.connect(bp).connect(this.airGain).connect(this.master);
    this.airGain.connect(this.verb);
    noise.start();
  }

  update(scrollSpeed) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(Math.abs(scrollSpeed), 1.2);
    // the score breathes: a near-silent bed while the visitor is still,
    // a slow tide underneath, and a bloom that follows their motion —
    // presence when it matters, never a drone
    const tide = 0.5 + 0.5 * Math.sin(t * 0.19);
    const pad = 0.030 + tide * 0.018 + Math.min(s * 0.32, 0.070);
    this.padBus.gain.setTargetAtTime(pad, t, 0.9);
    this.filter.frequency.setTargetAtTime(300 + s * 2100 + tide * 140, t, 0.6);
    this.airGain.gain.setTargetAtTime(Math.min(s * 0.38, 0.11), t, 0.35);
  }

  actChange(i) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    CHORDS[i]?.forEach((f, k) => {
      this.oscs[k]?.frequency.setTargetAtTime(f, t, 2.2);
    });
  }

  chime(i) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = PENTA[i % PENTA.length];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g); g.connect(this.verb); g.connect(this.master);
    o.start(t); o.stop(t + 2.4);
  }

  boom() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(27, t + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(this.master);
    g.connect(this.verb);
    o.start(t); o.stop(t + 1.5);
  }
}
