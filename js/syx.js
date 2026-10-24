// Reading and writing DX7 system exclusive (.syx) data.
// Voice objects use the unpacked (VCED) parameters; ops[0] is OP1.

const clamp = (v, max) => Math.max(0, Math.min(max, v | 0));

export function initVoice() {
  const op = (on) => ({
    r: [99, 99, 99, 99], l: [99, 99, 99, 0], bp: 39, ld: 0, rd: 0, lc: 0, rc: 0, rs: 0,
    ams: 0, kvs: 0, ol: on ? 99 : 0, mode: 0, fc: 1, ff: 0, det: 7,
  });
  return {
    name: 'INIT VOICE',
    ops: [op(true), op(false), op(false), op(false), op(false), op(false)],
    peg: { r: [99, 99, 99, 99], l: [50, 50, 50, 50] },
    alg: 0, fb: 0, oks: 1,
    lfo: { speed: 35, delay: 0, pmd: 0, amd: 0, sync: 1, wave: 0, pms: 3 },
    transpose: 24,
  };
}

export function cloneVoice(v) { return JSON.parse(JSON.stringify(v)); }

function readName(bytes, off) {
  let s = '';
  for (let i = 0; i < 10; i++) {
    const c = bytes[off + i] & 0x7f;
    s += c >= 32 && c < 127 ? String.fromCharCode(c) : ' ';
  }
  return s.trimEnd();
}

function writeName(bytes, off, name) {
  const n = (name || '').padEnd(10, ' ');
  for (let i = 0; i < 10; i++) {
    const c = n.charCodeAt(i);
    bytes[off + i] = c >= 32 && c < 127 ? c : 32;
  }
}

// 128-byte packed voice as stored in a 32-voice bank
export function unpackVoice(b, off = 0) {
  const v = initVoice();
  for (let n = 0; n < 6; n++) {
    const o = off + n * 17;
    v.ops[5 - n] = {
      r: [0, 1, 2, 3].map((i) => clamp(b[o + i], 99)),
      l: [4, 5, 6, 7].map((i) => clamp(b[o + i], 99)),
      bp: clamp(b[o + 8], 99), ld: clamp(b[o + 9], 99), rd: clamp(b[o + 10], 99),
      lc: b[o + 11] & 3, rc: (b[o + 11] >> 2) & 3,
      rs: b[o + 12] & 7, det: clamp((b[o + 12] >> 3) & 15, 14),
      ams: b[o + 13] & 3, kvs: (b[o + 13] >> 2) & 7,
      ol: clamp(b[o + 14], 99),
      mode: b[o + 15] & 1, fc: (b[o + 15] >> 1) & 31,
      ff: clamp(b[o + 16], 99),
    };
  }
  v.peg = {
    r: [0, 1, 2, 3].map((i) => clamp(b[off + 102 + i], 99)),
    l: [0, 1, 2, 3].map((i) => clamp(b[off + 106 + i], 99)),
  };
  v.alg = b[off + 110] & 31;
  v.fb = b[off + 111] & 7;
  v.oks = (b[off + 111] >> 3) & 1;
  v.lfo = {
    speed: clamp(b[off + 112], 99), delay: clamp(b[off + 113], 99),
    pmd: clamp(b[off + 114], 99), amd: clamp(b[off + 115], 99),
    sync: b[off + 116] & 1, wave: Math.min(5, (b[off + 116] >> 1) & 7), pms: (b[off + 116] >> 4) & 7,
  };
  v.transpose = clamp(b[off + 117], 48);
  v.name = readName(b, off + 118);
  return v;
}

export function packVoice(v, b, off = 0) {
  for (let n = 0; n < 6; n++) {
    const op = v.ops[5 - n];
    const o = off + n * 17;
    for (let i = 0; i < 4; i++) { b[o + i] = op.r[i]; b[o + 4 + i] = op.l[i]; }
    b[o + 8] = op.bp; b[o + 9] = op.ld; b[o + 10] = op.rd;
    b[o + 11] = (op.rc << 2) | op.lc;
    b[o + 12] = (op.det << 3) | op.rs;
    b[o + 13] = (op.kvs << 2) | op.ams;
    b[o + 14] = op.ol;
    b[o + 15] = (op.fc << 1) | op.mode;
    b[o + 16] = op.ff;
  }
  for (let i = 0; i < 4; i++) { b[off + 102 + i] = v.peg.r[i]; b[off + 106 + i] = v.peg.l[i]; }
  b[off + 110] = v.alg;
  b[off + 111] = (v.oks << 3) | v.fb;
  b[off + 112] = v.lfo.speed; b[off + 113] = v.lfo.delay;
  b[off + 114] = v.lfo.pmd; b[off + 115] = v.lfo.amd;
  b[off + 116] = (v.lfo.pms << 4) | (v.lfo.wave << 1) | v.lfo.sync;
  b[off + 117] = v.transpose;
  writeName(b, off + 118, v.name);
}

// 155-byte single voice (VCED) data
function unpackVced(b, off) {
  const v = initVoice();
  for (let n = 0; n < 6; n++) {
    const o = off + n * 21;
    v.ops[5 - n] = {
      r: [0, 1, 2, 3].map((i) => clamp(b[o + i], 99)),
      l: [4, 5, 6, 7].map((i) => clamp(b[o + i], 99)),
      bp: clamp(b[o + 8], 99), ld: clamp(b[o + 9], 99), rd: clamp(b[o + 10], 99),
      lc: b[o + 11] & 3, rc: b[o + 12] & 3, rs: b[o + 13] & 7, ams: b[o + 14] & 3,
      kvs: b[o + 15] & 7, ol: clamp(b[o + 16], 99), mode: b[o + 17] & 1, fc: b[o + 18] & 31,
      ff: clamp(b[o + 19], 99), det: clamp(b[o + 20], 14),
    };
  }
  v.peg = {
    r: [0, 1, 2, 3].map((i) => clamp(b[off + 126 + i], 99)),
    l: [0, 1, 2, 3].map((i) => clamp(b[off + 130 + i], 99)),
  };
  v.alg = b[off + 134] & 31; v.fb = b[off + 135] & 7; v.oks = b[off + 136] & 1;
  v.lfo = {
    speed: clamp(b[off + 137], 99), delay: clamp(b[off + 138], 99), pmd: clamp(b[off + 139], 99),
    amd: clamp(b[off + 140], 99), sync: b[off + 141] & 1, wave: Math.min(5, b[off + 142]), pms: b[off + 143] & 7,
  };
  v.transpose = clamp(b[off + 144], 48);
  v.name = readName(b, off + 145);
  return v;
}

// Returns an array of voices found in the file (32 for a bank, 1 for a single voice).
export function parseSysex(buffer) {
  const b = new Uint8Array(buffer);
  const voices = [];
  for (let i = 0; i < b.length - 6; i++) {
    if (b[i] !== 0xf0 || b[i + 1] !== 0x43) continue;
    const format = b[i + 3];
    if (format === 0x09 && i + 6 + 4096 <= b.length) {
      for (let n = 0; n < 32; n++) voices.push(unpackVoice(b, i + 6 + n * 128));
      i += 4096;
    } else if (format === 0x00 && i + 6 + 155 <= b.length) {
      voices.push(unpackVced(b, i + 6));
      i += 155;
    }
  }
  // Some files are raw 4096-byte bank dumps without a header
  if (!voices.length && b.length === 4096) {
    for (let n = 0; n < 32; n++) voices.push(unpackVoice(b, n * 128));
  }
  if (!voices.length) throw new Error('Hittade ingen DX7-data i filen');
  return voices;
}

export function buildBankSysex(voices) {
  const out = new Uint8Array(4104);
  out.set([0xf0, 0x43, 0x00, 0x09, 0x20, 0x00]);
  const data = new Uint8Array(4096);
  for (let n = 0; n < 32; n++) packVoice(voices[n] || initVoice(), data, n * 128);
  out.set(data, 6);
  let sum = 0;
  for (let i = 0; i < 4096; i++) sum += data[i];
  out[4102] = (128 - (sum & 127)) & 127;
  out[4103] = 0xf7;
  return out;
}
