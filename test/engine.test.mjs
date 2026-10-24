// Renders every preset through the worklet engine in Node and checks the output.
// Run: node test/engine.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { ALGORITHMS } from '../js/algorithms.js';
import { PRESETS } from '../js/presets.js';
import { parseSysex, buildBankSysex, initVoice } from '../js/syx.js';

const SR = 48000;
let Proc;
const ctx = {
  sampleRate: SR, Math, Float32Array, Float64Array, Array, console,
  AudioWorkletProcessor: class { constructor() { this.port = { onmessage: null }; } },
  registerProcessor: (n, c) => { Proc = c; },
};
vm.runInNewContext(fs.readFileSync(new URL('../js/dx7-worklet.js', import.meta.url), 'utf8'), ctx);

function render(patch, seconds, notes = [60, 64, 67], holdSec = 1) {
  const p = new Proc({ processorOptions: { algorithms: ALGORITHMS } });
  p.onMessage({ type: 'patch', patch });
  for (const n of notes) p.onMessage({ type: 'noteOn', note: n, velocity: 100 });
  const total = Math.floor(seconds * SR);
  const out = new Float32Array(total);
  for (let pos = 0; pos < total; pos += 128) {
    if (pos <= holdSec * SR && pos + 128 > holdSec * SR) for (const n of notes) p.onMessage({ type: 'noteOff', note: n });
    const L = new Float32Array(128), R = new Float32Array(128);
    p.process([], [[L, R]]);
    out.set(L.subarray(0, Math.min(128, total - pos)), pos);
  }
  return { out, proc: p };
}

const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
const rms = (a, s, e) => { let x = 0; for (let i = s; i < e; i++) x += a[i] * a[i]; return Math.sqrt(x / (e - s)); };
let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.log('FAIL', msg); } };

for (const patch of PRESETS) {
  const { out, proc } = render(patch, 4);
  const nan = out.some((x) => !Number.isFinite(x));
  const peak = out.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const early = rms(out, 0, SR * 0.5);
  const late = rms(out, SR * 3.5, SR * 4);
  const active = proc.voices.filter((v) => v.active).length;
  // zero crossings in first 0.3 s as a crude brightness measure
  let zc = 0; for (let i = 1; i < SR * 0.3; i++) if ((out[i] >= 0) !== (out[i - 1] >= 0)) zc++;
  console.log(`${patch.name.padEnd(11)} peak ${peak.toFixed(2)} rms ${early.toFixed(3)} tail ${late.toFixed(4)} zc/s ${(zc / 0.3) | 0} voices left ${active}`);
  check(!nan, `${patch.name}: NaN in output`);
  check(early > 0.01, `${patch.name}: too quiet`);
  check(peak <= 1.0, `${patch.name}: clipping`);
  check(late < early, `${patch.name}: does not release`);
  fs.mkdirSync(new URL('../test/out/', import.meta.url), { recursive: true });
}

// Every algorithm produces sound with all operators on
for (let a = 0; a < 32; a++) {
  const patch = { ...PRESETS[0], alg: a, ops: PRESETS[0].ops.map((o) => ({ ...o, l: [99, 99, 99, 0], ol: 80 })) };
  const { out } = render(patch, 0.5, [60], 0.4);
  check(rms(out, 0, SR * 0.3) > 0.005 && out.every(Number.isFinite), `algorithm ${a + 1} silent or NaN`);
}

// INIT VOICE is a pure sine: A4 should be 440 Hz
{
  const { out } = render(initVoice(), 1.2, [69], 1.1);
  let zc = 0; for (let i = SR * 0.1 + 1; i < SR * 1.1; i++) if ((out[i] >= 0) !== (out[i - 1] >= 0)) zc++;
  check(Math.abs(zc / 2 - 440) <= 1, `A4 tuning: ${zc / 2} Hz`);
}

// sysex round trip
const bank = buildBankSysex(PRESETS);
const back = parseSysex(bank.buffer);
check(back.length === 32, 'bank has 32 voices');
for (let i = 0; i < PRESETS.length; i++) {
  check(canon(back[i]) === canon(PRESETS[i]), `sysex round trip ${PRESETS[i].name}`);
}

console.log(failed ? `${failed} failures` : 'all tests passed');
process.exit(failed ? 1 : 0);
