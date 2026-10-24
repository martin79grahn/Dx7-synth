// DX7-style 6-operator FM synthesis engine, running as an AudioWorklet.
// Envelope, level/rate scaling, velocity, pitch EG and LFO follow the
// behaviour of the DX7 as documented by the open-source MSFA/Dexed engine.

const BLOCK = 16; // samples between envelope/LFO updates (gain is interpolated)
const N_VOICES = 16;
const SIN_BITS = 12;
const SIN_SIZE = 1 << SIN_BITS;
const SIN_MASK = SIN_SIZE - 1;
const SIN = new Float32Array(SIN_SIZE + 1);
for (let i = 0; i <= SIN_SIZE; i++) SIN[i] = Math.sin((2 * Math.PI * i) / SIN_SIZE);

// --- tables (from the DX7 behaviour as reverse engineered in MSFA) ---
const LEVEL_LUT = [0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46];
const scaleOutLevel = (l) => (l >= 20 ? 28 + l : LEVEL_LUT[l]);

const VELOCITY_DATA = [0, 70, 86, 97, 106, 114, 121, 126, 132, 138, 142, 148, 152, 156, 160, 163, 166, 170, 173,
  174, 178, 181, 184, 186, 189, 190, 194, 196, 198, 200, 202, 205, 206, 209, 211, 214, 216, 218, 220, 222, 224,
  225, 227, 229, 230, 232, 233, 235, 237, 238, 240, 241, 242, 243, 244, 246, 246, 248, 249, 250, 251, 252, 253, 254];
function scaleVelocity(velocity, sens) {
  const v = VELOCITY_DATA[Math.max(0, Math.min(127, velocity)) >> 1] - 239;
  return ((sens * v + 7) >> 3) << 4;
}

const EXP_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 16, 19, 23, 27, 33, 39, 47, 56, 66, 80, 94, 110, 126,
  142, 158, 174, 190, 206, 222, 238, 250];
function scaleCurve(group, depth, curve) {
  let scale;
  if (curve === 0 || curve === 3) scale = (group * depth * 329) >> 12;
  else scale = (EXP_SCALE[Math.min(group, EXP_SCALE.length - 1)] * depth * 329) >> 15;
  return curve < 2 ? -scale : scale;
}
function scaleLevel(note, bp, ld, rd, lc, rc) {
  const offset = note - bp - 17;
  if (offset >= 0) return scaleCurve(((offset + 1) / 3) | 0, rd, rc);
  return scaleCurve((-(offset - 1) / 3) | 0, ld, lc);
}
function scaleRate(note, sens) {
  const x = Math.min(31, Math.max(0, ((note / 3) | 0) - 7));
  return (sens * x) >> 3;
}

const PITCHENV_TAB = [-128, -116, -104, -95, -85, -76, -68, -61, -56, -52, -49, -46, -43, -41, -39, -37, -35, -33,
  -32, -31, -30, -29, -28, -27, -26, -25, -24, -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10,
  -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 38, 40, 43, 46, 49, 53, 58, 65, 73, 82, 92, 103, 115, 127];
const PITCHENV_RATE = [1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 9, 9, 10, 10, 10, 11, 11, 12, 12, 13, 13, 14,
  14, 15, 16, 16, 17, 18, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 33, 34, 36, 37, 38, 39, 41, 42, 44,
  46, 47, 49, 51, 53, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 79, 82, 85, 88, 91, 94, 98, 102, 106, 110,
  115, 120, 125, 130, 135, 141, 147, 153, 159, 165, 171, 178, 185, 193, 202, 211, 232, 243];
const PITCH_MOD_SENS = [0, 10, 20, 33, 55, 92, 153, 255];
const AMP_MOD_SENS = [0, 0.26, 0.43, 1];

// Operator amplitude envelope. Level is in DX7 log units: 256 units = 6 dB.
class Env {
  constructor() { this.level = 0; this.ix = 4; this.down = false; }
  init(rates, levels, outlevel, rateScaling, rateUnit) {
    this.rates = rates; this.levels = levels; this.outlevel = outlevel;
    this.rateScaling = rateScaling; this.rateUnit = rateUnit;
    this.level = 0; this.down = true;
    this.advance(0);
  }
  advance(ix) {
    this.ix = ix;
    if (ix < 4) {
      let actual = ((scaleOutLevel(this.levels[ix]) >> 1) << 6) + this.outlevel - 4256;
      if (actual < 16) actual = 16;
      this.target = actual;
      this.rising = actual > this.level;
      let q = ((this.rates[ix] * 41) >> 6) + this.rateScaling;
      if (q > 63) q = 63;
      this.inc = (4 + (q & 3)) * Math.pow(2, 2 + 6 + (q >> 2)) * this.rateUnit;
    }
  }
  keyUp() { if (this.down) { this.down = false; this.advance(3); } }
  step() {
    if (this.ix < 3 || (this.ix < 4 && !this.down)) {
      if (this.rising) {
        if (this.level < 1716) this.level = 1716;
        this.level += Math.floor((4352 - this.level) / 256) * this.inc;
        if (this.level >= this.target) { this.level = this.target; this.advance(this.ix + 1); }
      } else {
        this.level -= this.inc;
        if (this.level <= this.target) { this.level = this.target; this.advance(this.ix + 1); }
      }
    }
    return this.level;
  }
}

// Pitch envelope; value in octaves.
class PitchEnv {
  init(rates, levels, unit) {
    this.rates = rates; this.levels = levels; this.unit = unit;
    this.level = PITCHENV_TAB[levels[3]] / 32;
    this.down = true;
    this.advance(0);
  }
  advance(ix) {
    this.ix = ix;
    if (ix < 4) {
      this.target = PITCHENV_TAB[this.levels[ix]] / 32;
      this.rising = this.target > this.level;
      this.inc = PITCHENV_RATE[this.rates[ix]] * this.unit;
    }
  }
  keyUp() { if (this.down) { this.down = false; this.advance(3); } }
  step() {
    if (this.ix < 3 || (this.ix < 4 && !this.down)) {
      if (this.rising) {
        this.level += this.inc;
        if (this.level >= this.target) { this.level = this.target; this.advance(this.ix + 1); }
      } else {
        this.level -= this.inc;
        if (this.level <= this.target) { this.level = this.target; this.advance(this.ix + 1); }
      }
    }
    return this.level;
  }
}

class Voice {
  constructor() {
    this.env = [0, 1, 2, 3, 4, 5].map(() => new Env());
    this.penv = new PitchEnv();
    this.phase = new Float64Array(6);
    this.out = new Float64Array(6);
    this.gain = new Float64Array(6);
    this.gainStep = new Float64Array(6);
    this.inc = new Float64Array(6);
    this.note = -1;
    this.active = false;
    this.keyDown = false;
    this.sustained = false;
    this.age = 0;
    this.fb0 = 0; this.fb1 = 0;
    this.lfoDelayPos = 0;
  }
}

// Generates an unrolled per-sample loop for one algorithm. Phases are in
// cycles; operator outputs are in cycles of phase modulation (gain 2 = 4*pi).
// A bias that is a multiple of the table size keeps the table index positive.
function buildRenderer(alg) {
  const ops = [0, 1, 2, 3, 4, 5];
  let c = 'const ph = v.phase, inc = v.inc, g = v.gain, gs = v.gainStep, o = v.out;\n';
  c += ops.map((i) => `let p${i} = ph[${i}], i${i} = inc[${i}], g${i} = g[${i}], s${i} = gs[${i}], o${i} = o[${i}];`).join('\n');
  c += '\nlet fb0 = v.fb0, fb1 = v.fb1, t = 0, ti = 0, fr = 0;\n';
  c += 'for (let s = start; s < end; s++) {\n';
  for (let i = 5; i >= 0; i--) {
    const terms = alg.mods[i].map((m) => `o${m}`);
    if (i === alg.fbDst) terms.push('(fb0 + fb1) * fbScale');
    const mod = terms.length ? ' + ' + terms.join(' + ') : '';
    c += `  p${i} += i${i}; if (p${i} >= 1) p${i} -= 1; g${i} += s${i};\n`;
    c += `  t = (p${i}${mod}) * ${SIN_SIZE} + 1048576; ti = t | 0; fr = t - ti; ti &= ${SIN_MASK};\n`;
    c += `  o${i} = (SIN[ti] + (SIN[ti + 1] - SIN[ti]) * fr) * g${i};\n`;
  }
  c += `  fb1 = fb0; fb0 = o${alg.fbSrc};\n`;
  c += `  mix[s] += ${ops.filter((i) => alg.carrier[i]).map((i) => `o${i}`).join(' + ')};\n}\n`;
  c += ops.map((i) => `ph[${i}] = p${i}; g[${i}] = g${i}; o[${i}] = o${i};`).join('\n');
  c += '\nv.fb0 = fb0; v.fb1 = fb1;';
  return new Function('v', 'mix', 'start', 'end', 'fbScale', 'SIN', c);
}

class DX7Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.compileAlgorithms(opts.algorithms);
    this.sr = sampleRate;
    // Rates are calibrated for 44.1 kHz and 64-sample blocks in the reference engine.
    this.envUnit = (1 / 65536) * (BLOCK / 64) * (44100 / this.sr);
    this.pitchUnit = BLOCK / (21.3 * this.sr);
    this.voices = Array.from({ length: N_VOICES }, () => new Voice());
    this.patch = null;
    this.sustain = false;
    this.bend = 0; this.bendRange = 2;
    this.modWheel = 0;
    this.volume = 0.8;
    this.lfoPhase = 0; this.lfoSH = 0.5;
    this.ageCounter = 0;
    this.limGain = 1;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  compileAlgorithms(algs) {
    this.algs = (algs || []).map((a) => {
      const mods = [];
      for (let op = 0; op < 6; op++) mods.push(((a.mods[op + 1]) || []).map((m) => m - 1));
      const carrier = [0, 0, 0, 0, 0, 0];
      a.carriers.forEach((c) => { carrier[c - 1] = 1; });
      const alg = { mods, carrier, fbDst: a.fb[0] - 1, fbSrc: a.fb[1] - 1 };
      alg.render = buildRenderer(alg);
      return alg;
    });
  }

  onMessage(m) {
    switch (m.type) {
      case 'patch': this.patch = m.patch; this.lfoSetup(); break;
      case 'noteOn': this.noteOn(m.note, m.velocity); break;
      case 'noteOff': this.noteOff(m.note); break;
      case 'sustain':
        this.sustain = m.on;
        if (!m.on) for (const v of this.voices) if (v.sustained) { v.sustained = false; this.releaseVoice(v); }
        break;
      case 'bend': this.bend = m.value; break;
      case 'bendRange': this.bendRange = m.value; break;
      case 'modWheel': this.modWheel = m.value; break;
      case 'volume': this.volume = m.value; break;
      case 'allOff':
        for (const v of this.voices) { v.active = false; v.keyDown = false; v.sustained = false; }
        break;
    }
  }

  lfoSetup() {
    const l = this.patch.lfo;
    let s = l.speed === 0 ? 1 : (165 * l.speed) >> 6;
    s *= s < 160 ? 11 : 11 + ((s - 160) >> 4);
    this.lfoFreq = (s * 25190424) / 4294967296; // Hz
    const a = 99 - l.delay;
    if (a === 99) { this.lfoDelay1 = 0; this.lfoDelay2 = 0; }
    else {
      const a1 = (16 + (a & 15)) << (1 + (a >> 4));
      const a2 = Math.max(0x80, a1 & 0xff80);
      this.lfoDelay1 = 85.25 / a1; // seconds of silence
      this.lfoDelay2 = 85.25 / a2; // seconds of fade-in
    }
  }

  noteOn(note, velocity) {
    const p = this.patch;
    if (!p) return;
    if (velocity === 0) { this.noteOff(note); return; }
    let v = this.voices.find((x) => !x.active);
    if (!v) {
      // steal: prefer released voices, then the oldest
      v = this.voices.reduce((best, x) => {
        const score = (x.keyDown ? 1e9 : 0) + x.age;
        const bestScore = (best.keyDown ? 1e9 : 0) + best.age;
        return score < bestScore ? x : best;
      });
    }
    const wasActive = v.active;
    v.note = note; v.velocity = velocity;
    v.active = true; v.keyDown = true; v.sustained = false;
    v.age = ++this.ageCounter;
    const keyNote = note + (p.transpose - 24);
    for (let i = 0; i < 6; i++) {
      const op = p.ops[i];
      let outlevel = scaleOutLevel(op.ol);
      outlevel += scaleLevel(keyNote, op.bp, op.ld, op.rd, op.lc, op.rc);
      outlevel = Math.min(127, outlevel) << 5;
      outlevel += scaleVelocity(velocity, op.kvs);
      outlevel = Math.max(0, outlevel);
      v.env[i].init(op.r, op.l, outlevel, scaleRate(keyNote, op.rs), this.envUnit);
      if (p.oks || !wasActive) v.phase[i] = p.oks ? 0 : Math.random();
      v.gain[i] = 0; v.gainStep[i] = 0; v.out[i] = 0;
    }
    v.fb0 = 0; v.fb1 = 0;
    v.penv.init(p.peg.r, p.peg.l, this.pitchUnit);
    v.lfoDelayPos = 0;
    if (p.lfo.sync) this.lfoPhase = 0;
  }

  noteOff(note) {
    for (const v of this.voices) {
      if (v.active && v.keyDown && v.note === note) {
        v.keyDown = false;
        if (this.sustain) v.sustained = true; else this.releaseVoice(v);
      }
    }
  }

  releaseVoice(v) {
    for (let i = 0; i < 6; i++) v.env[i].keyUp();
    v.penv.keyUp();
  }

  lfoValue() {
    const ph = this.lfoPhase;
    switch (this.patch.lfo.wave) {
      case 0: return ph < 0.5 ? 2 * ph : 2 - 2 * ph; // triangle
      case 1: return 1 - ph; // saw down
      case 2: return ph; // saw up
      case 3: return ph < 0.5 ? 1 : 0; // square
      case 4: return 0.5 + 0.5 * Math.sin(2 * Math.PI * ph); // sine
      default: return this.lfoSH; // sample & hold
    }
  }

  // Called every BLOCK samples: advance envelopes, pitch, LFO.
  controlUpdate(v, alg, lfo, pmBase, amBase) {
    const p = this.patch;
    let delayAmt = 1;
    if (this.lfoDelay1 > 0) {
      const t = v.lfoDelayPos;
      delayAmt = t < this.lfoDelay1 ? 0 : Math.min(1, (t - this.lfoDelay1) / this.lfoDelay2);
      v.lfoDelayPos += BLOCK / this.sr;
    }
    const pitchOct = v.penv.step() + pmBase * delayAmt + (this.bend * this.bendRange) / 12;
    const keyNote = v.note + (p.transpose - 24);
    const baseLog2 = Math.log2(440) + (keyNote - 69) / 12;
    const amDepth = amBase * delayAmt;
    let anyAudible = false;
    for (let i = 0; i < 6; i++) {
      const op = p.ops[i];
      let freq;
      if (op.mode === 1) {
        freq = Math.pow(10, (op.fc & 3) + op.ff / 100);
      } else {
        const detuneRatio = (0.0209 * Math.exp(-0.396 * baseLog2)) / 7;
        const lf = baseLog2 * (1 + detuneRatio * (op.det - 7));
        const ratio = (op.fc === 0 ? 0.5 : op.fc) * (1 + op.ff / 100);
        freq = Math.pow(2, lf + pitchOct) * ratio;
      }
      v.inc[i] = freq / this.sr;
      let level = v.env[i].step();
      if (op.ams && amDepth > 0) level -= amDepth * AMP_MOD_SENS[op.ams] * 2048;
      const target = level > 0 ? Math.pow(2, level / 256 - 14) : 0;
      v.gainStep[i] = (target - v.gain[i]) / BLOCK;
      if (alg.carrier[i] && (v.env[i].ix < 4 || level > 1100)) anyAudible = true;
    }
    if (!anyAudible && !v.keyDown && !v.sustained) v.active = false;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || null;
    const n = L.length;
    if (!this.patch) { return true; }
    const p = this.patch;
    const alg = this.algs[p.alg];
    const fbScale = p.fb ? Math.pow(2, p.fb - 8) / 2 : 0;
    const mix = new Float32Array(n);

    for (let start = 0; start < n; start += BLOCK) {
      const end = Math.min(n, start + BLOCK);
      // global LFO
      this.lfoPhase += (this.lfoFreq * (end - start)) / this.sr;
      if (this.lfoPhase >= 1) { this.lfoPhase -= 1; this.lfoSH = Math.random(); }
      const lfo = this.lfoValue();
      const pmd = Math.min(99, p.lfo.pmd + this.modWheel * 80);
      const pmBase = (Math.min(255, (pmd * 165) >> 6) / 255) * (PITCH_MOD_SENS[p.lfo.pms] / 255) * (lfo - 0.5) * 2;
      const amBase = (Math.min(255, (p.lfo.amd * 165) >> 6) / 255) * (1 - lfo);

      for (const v of this.voices) {
        if (!v.active) continue;
        this.controlUpdate(v, alg, lfo, pmBase, amBase);
        if (!v.active) continue;
        alg.render(v, mix, start, end, fbScale, SIN);
      }
    }

    // output gain with a gentle peak limiter
    const vol = this.volume * 0.12;
    for (let s = 0; s < n; s++) {
      let x = mix[s] * vol;
      const a = Math.abs(x) * this.limGain;
      if (a > 0.95) this.limGain *= 0.95 / a;
      else this.limGain += (1 - this.limGain) * 0.00005;
      x *= this.limGain;
      L[s] = x;
      if (R) R[s] = x;
    }
    return true;
  }
}

registerProcessor('dx7', DX7Processor);
