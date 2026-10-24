import { Synth } from './audio.js';
import { Keyboard, noteName } from './keyboard.js';
import { drawAlgorithm } from './diagram.js';
import { ALGORITHMS } from './algorithms.js';
import { PRESETS } from './presets.js';
import { initVoice, cloneVoice, parseSysex, buildBankSysex } from './syx.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('dx7.' + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('dx7.' + key, JSON.stringify(value)); return true; } catch (e) { return false; }
  },
};

const synth = new Synth();

// ---------- banks ----------
const userVoices = store.get('userBank', null) || Array.from({ length: 32 }, () => initVoice());
const banks = [
  { id: 'builtin', name: 'Inbyggda ljud', voices: PRESETS, readonly: true },
  { id: 'user', name: 'Mina ljud', voices: userVoices },
  ...store.get('imported', []).map((b) => ({ ...b, imported: true })),
];
const saveUserBank = () => store.set('userBank', userVoices);
const saveImported = () => {
  const ok = store.set('imported', banks.filter((b) => b.imported).map(({ id, name, voices }) => ({ id, name, voices })));
  if (!ok) toast('Kunde inte spara banken (lagringen är full)');
};

const settings = {
  bankId: 'builtin', voiceIndex: 0, startNote: 48, volume: 0.8, bendRange: 2,
  keyWidth: 46, velocityByPosition: true,
  ...store.get('settings', {}),
};
const saveSettings = () => store.set('settings', settings);

let bank = banks.find((b) => b.id === settings.bankId) || banks[0];
let voiceIndex = Math.min(settings.voiceIndex, bank.voices.length - 1);
let voice = cloneVoice(bank.voices[voiceIndex]); // working copy being played/edited
const opOn = [true, true, true, true, true, true];
let selOp = 0;
let lcdMessage = null;
let lcdTimer = 0;

function sendPatch() {
  const p = cloneVoice(voice);
  p.ops.forEach((op, i) => { if (!opOn[i]) op.ol = 0; });
  synth.setPatch(p);
}

// ---------- LCD ----------
const pad2 = (n) => String(n).padStart(2, '0');
function updateLcd() {
  const prefix = bank.id === 'builtin' ? 'INT' : bank.id === 'user' ? 'USR' : 'CRT';
  $('lcd1').textContent = `${prefix} ${pad2(voiceIndex + 1)} ${voice.name}`;
  $('lcd2').textContent = lcdMessage || `ALG ${pad2(voice.alg + 1)}  FB ${voice.fb}`;
}
function flashLcd(text) {
  lcdMessage = text;
  updateLcd();
  clearTimeout(lcdTimer);
  lcdTimer = setTimeout(() => { lcdMessage = null; updateLcd(); }, 1800);
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- voice selection ----------
function selectVoice(index, b = bank) {
  bank = b;
  voiceIndex = (index + bank.voices.length) % bank.voices.length;
  voice = cloneVoice(bank.voices[voiceIndex]);
  opOn.fill(true);
  settings.bankId = bank.id; settings.voiceIndex = voiceIndex; saveSettings();
  sendPatch();
  updateLcd();
  renderVoiceGrid();
  renderEditor();
}

function renderBankSelect() {
  const sel = $('bankSelect');
  sel.innerHTML = '';
  for (const b of banks) {
    const o = document.createElement('option');
    o.value = b.id; o.textContent = b.name;
    sel.appendChild(o);
  }
  sel.value = bank.id;
}

function renderVoiceGrid() {
  const grid = $('voiceGrid');
  grid.innerHTML = '';
  bank.voices.forEach((v, i) => {
    const btn = document.createElement('button');
    btn.className = 'voice-btn' + (i === voiceIndex ? ' active' : '');
    btn.innerHTML = `<span class="num">${pad2(i + 1)}</span><span></span>`;
    btn.lastChild.textContent = v.name;
    btn.addEventListener('click', () => selectVoice(i));
    grid.appendChild(btn);
  });
  const hint = $('bankHint');
  if (bank.imported) {
    hint.innerHTML = '';
    const del = document.createElement('button');
    del.className = 'mbtn';
    del.textContent = 'Ta bort den här banken';
    del.addEventListener('click', () => {
      if (!confirm(`Ta bort "${bank.name}"?`)) return;
      banks.splice(banks.indexOf(bank), 1);
      saveImported();
      renderBankSelect();
      selectVoice(0, banks[0]);
    });
    hint.appendChild(del);
  } else if (bank.id === 'user') {
    hint.textContent = 'Spara ljud hit från fliken Redigera.';
  } else {
    hint.textContent = 'Tips: ladda riktiga DX7-banker (.syx, 32 ljud) med knappen ovan. Det finns tusentals gratis på nätet.';
  }
}

$('bankSelect').addEventListener('change', (e) => {
  const b = banks.find((x) => x.id === e.target.value);
  selectVoice(0, b);
});
$('prevVoice').addEventListener('click', () => selectVoice(voiceIndex - 1));
$('nextVoice').addEventListener('click', () => selectVoice(voiceIndex + 1));

$('syxFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const voices = parseSysex(await file.arrayBuffer());
    const name = file.name.replace(/\.syx$/i, '');
    if (voices.length === 1) {
      // a single voice goes into the first free slot of "Mina ljud"
      const userBank = banks.find((b) => b.id === 'user');
      let slot = userVoices.findIndex((v) => v.name === 'INIT VOICE');
      if (slot < 0) slot = 31;
      userVoices[slot] = voices[0];
      saveUserBank();
      renderBankSelect();
      selectVoice(slot, userBank);
      toast(`"${voices[0].name}" sparad i Mina ljud, plats ${slot + 1}`);
      return;
    }
    for (let i = 0; i < voices.length; i += 32) {
      const b = { id: 'imp-' + Date.now() + '-' + i, name: voices.length > 32 ? `${name} ${i / 32 + 1}` : name, voices: voices.slice(i, i + 32), imported: true };
      banks.push(b);
    }
    saveImported();
    const first = banks[banks.length - Math.ceil(voices.length / 32)];
    renderBankSelect();
    selectVoice(0, first);
    $('bankSelect').value = first.id;
    toast(`Laddade ${voices.length} ljud från ${file.name}`);
  } catch (err) {
    toast(err.message || 'Kunde inte läsa filen');
  }
});

// ---------- editor widgets ----------
let updaters = [];
function slider(parent, label, min, max, get, set, fmt = (v) => v, lcdLabel) {
  const row = document.createElement('div');
  row.className = 'param';
  const lab = document.createElement('label');
  lab.textContent = label;
  const input = document.createElement('input');
  input.type = 'range'; input.min = min; input.max = max; input.step = 1;
  const out = document.createElement('output');
  row.append(lab, input, out);
  parent.appendChild(row);
  const refresh = () => { const v = get(); input.value = v; out.textContent = fmt(v); };
  input.addEventListener('input', () => {
    set(+input.value);
    out.textContent = fmt(+input.value);
    sendPatch();
    flashLcd(`${(lcdLabel || label).toUpperCase().slice(0, 11).padEnd(11)}${String(fmt(+input.value)).padStart(5)}`);
    onEdit();
  });
  refresh();
  updaters.push(refresh);
  return refresh;
}

function segmented(parent, label, options, get, set) {
  const row = document.createElement('div');
  row.className = 'param';
  const lab = document.createElement('label');
  lab.textContent = label;
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.style.gridColumn = 'span 2';
  const btns = options.map((name, i) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.addEventListener('click', () => { set(i); sendPatch(); refresh(); onEdit(); flashLcd(`${label.toUpperCase().slice(0, 10)} ${name}`); });
    seg.appendChild(b);
    return b;
  });
  row.append(lab, seg);
  parent.appendChild(row);
  const refresh = () => btns.forEach((b, i) => b.classList.toggle('on', get() === i));
  refresh();
  updaters.push(refresh);
}

function title(parent, text) {
  const t = document.createElement('div');
  t.className = 'section-title';
  t.textContent = text;
  parent.appendChild(t);
}

function grid(parent) {
  const g = document.createElement('div');
  g.className = 'param-grid';
  parent.appendChild(g);
  return g;
}

// Draws a 4-stage envelope. Rate 99 is fast, 0 very slow; levels 0-99.
function egCanvas(parent, getRates, getLevels, startLevel, bipolar = false) {
  const c = document.createElement('canvas');
  c.className = 'eg-canvas';
  parent.appendChild(c);
  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 300, h = c.clientHeight || 70;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const r = getRates(), l = getLevels();
    const dur = r.map((x) => 0.15 + Math.pow((99 - x) / 99, 2.2) * 2.5);
    const sustain = 0.8;
    const total = dur[0] + dur[1] + dur[2] + sustain + dur[3];
    const X = (t) => 6 + (t / total) * (w - 12);
    const Y = (v) => h - 6 - (v / 99) * (h - 12);
    if (bipolar) { g.strokeStyle = '#3d3532'; g.beginPath(); g.moveTo(0, Y(50)); g.lineTo(w, Y(50)); g.stroke(); }
    g.strokeStyle = '#4fae9f'; g.lineWidth = 2;
    g.beginPath();
    let t = 0;
    g.moveTo(X(0), Y(startLevel(l)));
    for (let i = 0; i < 3; i++) { t += dur[i]; g.lineTo(X(t), Y(l[i])); }
    t += sustain; g.lineTo(X(t), Y(l[2]));
    t += dur[3]; g.lineTo(X(t), Y(l[3]));
    g.stroke();
    g.fillStyle = '#a79d8c'; g.font = '10px system-ui';
    g.fillText('släpp', X(dur[0] + dur[1] + dur[2] + sustain) + 3, 12);
  };
  requestAnimationFrame(draw);
  updaters.push(draw);
  return draw;
}

// ---------- formatting ----------
const CURVES = ['−LIN', '−EXP', '+EXP', '+LIN'];
const WAVES = ['TRI', 'SÅG↓', 'SÅG↑', 'FYRK', 'SINUS', 'S/H'];
function opFreqText(op) {
  if (op.mode === 1) {
    const f = Math.pow(10, (op.fc & 3) + op.ff / 100);
    return f >= 1000 ? `${(f / 1000).toFixed(2)}kHz` : `${f.toFixed(f < 10 ? 3 : f < 100 ? 2 : 1)}Hz`;
  }
  return `×${((op.fc === 0 ? 0.5 : op.fc) * (1 + op.ff / 100)).toFixed(2)}`;
}
const signed = (v) => (v > 0 ? '+' + v : String(v));
const bpName = (v) => noteName(v + 21);

// ---------- editor ----------
function onEdit() {
  updateLcd();
  refreshOpTabs();
}

function refreshOpTabs() {
  const alg = ALGORITHMS[voice.alg];
  [...$('opTabs').children].forEach((b, i) => {
    b.classList.toggle('active', i === selOp);
    b.classList.toggle('off', !opOn[i]);
    b.classList.toggle('carrier', alg.carriers.includes(i + 1));
    b.classList.toggle('mod', !alg.carriers.includes(i + 1));
  });
  drawAlgorithm($('algDiagram'), voice.alg, {
    selected: selOp, enabled: opOn,
    onSelect: (i) => { selOp = i; renderOpEditor(); refreshOpTabs(); },
  });
}

function renderEditor() {
  updaters = [];
  $('voiceName').value = voice.name;

  const top = $('globalTop');
  top.innerHTML = '';
  slider(top, 'Algoritm', 0, 31, () => voice.alg, (v) => { voice.alg = v; }, (v) => v + 1);
  slider(top, 'Feedback', 0, 7, () => voice.fb, (v) => { voice.fb = v; });
  slider(top, 'Transponera', 0, 48, () => voice.transpose, (v) => { voice.transpose = v; }, (v) => signed(v - 24));
  segmented(top, 'Osc. key sync', ['AV', 'PÅ'], () => voice.oks, (v) => { voice.oks = v; });

  const tabs = $('opTabs');
  tabs.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const b = document.createElement('button');
    b.className = 'op-tab';
    b.innerHTML = `<span class="led"></span><span>OP${i + 1}</span>`;
    b.addEventListener('click', () => { selOp = i; renderOpEditor(); refreshOpTabs(); });
    tabs.appendChild(b);
  }

  const peg = $('pegEditor');
  peg.innerHTML = '';
  egCanvas(peg, () => voice.peg.r, () => voice.peg.l, (l) => l[3], true);
  const pg = grid(peg);
  for (let i = 0; i < 4; i++) slider(pg, `Rate ${i + 1}`, 0, 99, () => voice.peg.r[i], (v) => { voice.peg.r[i] = v; }, undefined, `PEG R${i + 1}`);
  for (let i = 0; i < 4; i++) slider(pg, `Nivå ${i + 1}`, 0, 99, () => voice.peg.l[i], (v) => { voice.peg.l[i] = v; }, (v) => signed(v - 50), `PEG L${i + 1}`);

  const lfo = $('lfoEditor');
  lfo.innerHTML = '';
  segmented(lfo, 'Vågform', WAVES, () => voice.lfo.wave, (v) => { voice.lfo.wave = v; });
  const lg = grid(lfo);
  slider(lg, 'Hastighet', 0, 99, () => voice.lfo.speed, (v) => { voice.lfo.speed = v; }, undefined, 'LFO SPEED');
  slider(lg, 'Fördröjning', 0, 99, () => voice.lfo.delay, (v) => { voice.lfo.delay = v; }, undefined, 'LFO DELAY');
  slider(lg, 'Vibrato-djup', 0, 99, () => voice.lfo.pmd, (v) => { voice.lfo.pmd = v; }, undefined, 'LFO PMD');
  slider(lg, 'Tremolo-djup', 0, 99, () => voice.lfo.amd, (v) => { voice.lfo.amd = v; }, undefined, 'LFO AMD');
  slider(lg, 'Pitch-känsl.', 0, 7, () => voice.lfo.pms, (v) => { voice.lfo.pms = v; }, undefined, 'P MOD SENS');
  segmented(lfo, 'Key sync', ['AV', 'PÅ'], () => voice.lfo.sync, (v) => { voice.lfo.sync = v; });

  renderOpEditor();
  refreshOpTabs();
}

let opUpdaters = [];
function renderOpEditor() {
  updaters = updaters.filter((u) => !opUpdaters.includes(u));
  const before = updaters.length;
  const ed = $('opEditor');
  ed.innerHTML = '';
  const op = voice.ops[selOp];
  const n = selOp + 1;

  const head = document.createElement('div');
  head.className = 'btn-row';
  head.style.marginBottom = '6px';
  const onBtn = document.createElement('button');
  onBtn.className = 'mbtn toggle';
  const setOnText = () => { onBtn.textContent = opOn[selOp] ? `OP${n} PÅ` : `OP${n} AV`; onBtn.setAttribute('aria-pressed', opOn[selOp]); };
  setOnText();
  onBtn.addEventListener('click', () => { opOn[selOp] = !opOn[selOp]; setOnText(); sendPatch(); refreshOpTabs(); });
  const copyBtn = document.createElement('button');
  copyBtn.className = 'mbtn';
  copyBtn.textContent = 'Kopiera till…';
  copyBtn.addEventListener('click', () => {
    const t = parseInt(prompt(`Kopiera OP${n} till vilken operator (1-6)?`, String(n === 6 ? 1 : n + 1)), 10);
    if (t >= 1 && t <= 6 && t !== n) { voice.ops[t - 1] = cloneVoice(op); sendPatch(); toast(`OP${n} kopierad till OP${t}`); }
  });
  head.append(onBtn, copyBtn);
  ed.appendChild(head);

  title(ed, 'Frekvens');
  const fg = grid(ed);
  segmented(fg, 'Läge', ['RATIO', 'FAST Hz'], () => op.mode, (v) => { op.mode = v; refreshFreq(); });
  const freqRow = document.createElement('div');
  freqRow.className = 'param';
  freqRow.innerHTML = '<label>Frekvens</label><span></span><output></output>';
  fg.appendChild(freqRow);
  const refreshFreq = () => { freqRow.querySelector('output').textContent = opFreqText(op); };
  updaters.push(refreshFreq);
  const setF = (fn) => (v) => { fn(v); refreshFreq(); };
  slider(fg, 'Grov', 0, 31, () => op.fc, setF((v) => { op.fc = v; }), undefined, `OP${n} COARSE`);
  slider(fg, 'Fin', 0, 99, () => op.ff, setF((v) => { op.ff = v; }), undefined, `OP${n} FINE`);
  slider(fg, 'Detune', 0, 14, () => op.det, (v) => { op.det = v; }, (v) => signed(v - 7), `OP${n} DETUNE`);
  refreshFreq();

  title(ed, 'Nivå');
  const lgr = grid(ed);
  slider(lgr, 'Utnivå', 0, 99, () => op.ol, (v) => { op.ol = v; }, undefined, `OP${n} LEVEL`);
  slider(lgr, 'Anslagskänsl.', 0, 7, () => op.kvs, (v) => { op.kvs = v; }, undefined, `OP${n} VEL`);
  slider(lgr, 'Tremolo-känsl.', 0, 3, () => op.ams, (v) => { op.ams = v; }, undefined, `OP${n} AMS`);
  slider(lgr, 'Rate scaling', 0, 7, () => op.rs, (v) => { op.rs = v; }, undefined, `OP${n} RS`);

  title(ed, 'Envelope (EG)');
  egCanvas(ed, () => op.r, () => op.l, () => 0);
  const eg = grid(ed);
  for (let i = 0; i < 4; i++) slider(eg, `Rate ${i + 1}`, 0, 99, () => op.r[i], (v) => { op.r[i] = v; }, undefined, `OP${n} R${i + 1}`);
  for (let i = 0; i < 4; i++) slider(eg, `Nivå ${i + 1}`, 0, 99, () => op.l[i], (v) => { op.l[i] = v; }, undefined, `OP${n} L${i + 1}`);

  title(ed, 'Klaviaturskalning');
  const kg = grid(ed);
  slider(kg, 'Brytpunkt', 0, 99, () => op.bp, (v) => { op.bp = v; }, bpName, `OP${n} BREAK`);
  slider(kg, 'Vänster djup', 0, 99, () => op.ld, (v) => { op.ld = v; }, undefined, `OP${n} L DEPTH`);
  slider(kg, 'Höger djup', 0, 99, () => op.rd, (v) => { op.rd = v; }, undefined, `OP${n} R DEPTH`);
  segmented(kg, 'Vänster kurva', CURVES, () => op.lc, (v) => { op.lc = v; });
  segmented(kg, 'Höger kurva', CURVES, () => op.rc, (v) => { op.rc = v; });

  opUpdaters = updaters.slice(before);
}

$('voiceName').addEventListener('input', (e) => {
  voice.name = e.target.value.toUpperCase().replace(/[^\x20-\x7e]/g, '').slice(0, 10);
  updateLcd();
});

$('revertVoice').addEventListener('click', () => {
  voice = cloneVoice(bank.voices[voiceIndex]);
  opOn.fill(true);
  sendPatch(); updateLcd(); renderEditor();
  toast('Ändringarna ångrade');
});

$('saveVoice').addEventListener('click', () => {
  const userBank = banks.find((b) => b.id === 'user');
  let suggested = bank.id === 'user' ? voiceIndex + 1 : userVoices.findIndex((v) => v.name === 'INIT VOICE') + 1 || 32;
  const answer = prompt('Spara i "Mina ljud" på plats (1-32):', String(suggested));
  if (answer === null) return;
  const slot = parseInt(answer, 10);
  if (!(slot >= 1 && slot <= 32)) { toast('Ange en plats mellan 1 och 32'); return; }
  userVoices[slot - 1] = cloneVoice(voice);
  if (!saveUserBank()) { toast('Kunde inte spara (lagringen är full)'); return; }
  bank = userBank; voiceIndex = slot - 1;
  settings.bankId = 'user'; settings.voiceIndex = voiceIndex; saveSettings();
  renderBankSelect(); renderVoiceGrid(); updateLcd();
  toast(`Sparat på plats ${slot} i Mina ljud`);
});

$('exportBank').addEventListener('click', () => {
  const data = buildBankSysex(bank.voices.slice(0, 32));
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${bank.name.replace(/[^\w\- ]/g, '_')}.syx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

// ---------- settings ----------
function renderSettings() {
  const c = $('settingsCard');
  c.innerHTML = '<h3>Spelinställningar</h3>';
  const g = grid(c);
  slider(g, 'Volym', 0, 100, () => Math.round(settings.volume * 100), (v) => { settings.volume = v / 100; synth.setVolume(settings.volume); saveSettings(); }, (v) => v + '%', 'VOLUME');
  slider(g, 'Pitch bend', 0, 12, () => settings.bendRange, (v) => { settings.bendRange = v; synth.setBendRange(v); saveSettings(); }, (v) => `±${v}`, 'BEND RANGE');
  slider(g, 'Tangentbredd', 30, 80, () => settings.keyWidth, (v) => { settings.keyWidth = v; keyboard.keyWidth = v; keyboard.built = null; keyboard.build(); saveSettings(); }, (v) => v + 'px', 'KEY WIDTH');
  segmented(c, 'Anslag', ['FAST', 'PÅ TANGENT'], () => (settings.velocityByPosition ? 1 : 0), (v) => { settings.velocityByPosition = !!v; keyboard.velocityByPosition = !!v; saveSettings(); });
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Med "på tangent" spelar du starkare ju längre ner på tangenten du trycker, precis som anslag på ett riktigt keyboard.';
  c.appendChild(hint);
}

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + t.dataset.tab));
  if (t.dataset.tab === 'edit') updaters.forEach((u) => u());
}));

// ---------- performance controls ----------
const keyboard = new Keyboard($('keyboard'), {
  onNoteOn: (n, v) => { ensureAudio(); synth.noteOn(n, v); },
  onNoteOff: (n) => synth.noteOff(n),
});
keyboard.keyWidth = settings.keyWidth;
keyboard.velocityByPosition = settings.velocityByPosition;
keyboard.startNote = settings.startNote;
keyboard.build();

function setOctave(start) {
  settings.startNote = Math.max(12, Math.min(96, start));
  keyboard.setStart(settings.startNote);
  $('octLabel').textContent = noteName(settings.startNote);
  saveSettings();
}
$('octDown').addEventListener('click', () => setOctave(settings.startNote - 12));
$('octUp').addEventListener('click', () => setOctave(settings.startNote + 12));
$('octLabel').textContent = noteName(settings.startNote);

const sustainBtn = $('sustainBtn');
sustainBtn.addEventListener('click', () => {
  const on = sustainBtn.getAttribute('aria-pressed') !== 'true';
  sustainBtn.setAttribute('aria-pressed', on);
  synth.sustain(on);
});

function stripControl(el, springBack, onValue) {
  const thumb = el.querySelector('.strip-thumb');
  let active = null;
  const setFromX = (x) => {
    const r = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (x - r.left) / r.width));
    thumb.style.left = `${f * 100}%`;
    onValue(f);
  };
  el.addEventListener('pointerdown', (e) => { active = e.pointerId; el.setPointerCapture(e.pointerId); setFromX(e.clientX); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === active) setFromX(e.clientX); });
  const end = (e) => {
    if (e.pointerId !== active) return;
    active = null;
    if (springBack) { thumb.style.left = '50%'; onValue(0.5); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
stripControl($('bendStrip'), true, (f) => synth.bend((f - 0.5) * 2));
stripControl($('modStrip'), false, (f) => synth.modWheel(f));

// computer keyboard: A W S E D F T G Y H U J K O L P
const KEYMAP = 'awsedftgyhujkolp;';
const downKeys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { setOctave(settings.startNote - 12); return; }
  if (k === 'x') { setOctave(settings.startNote + 12); return; }
  const i = KEYMAP.indexOf(k);
  if (i < 0 || downKeys.has(k)) return;
  downKeys.add(k);
  keyboard.press(settings.startNote + i, 100);
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (!downKeys.has(k)) return;
  downKeys.delete(k);
  keyboard.release(settings.startNote + KEYMAP.indexOf(k));
});

// ---------- MIDI ----------
async function setupMidi() {
  const status = $('midiStatus');
  if (!navigator.requestMIDIAccess) { status.textContent = 'MIDI-keyboard: stöds inte i den här webbläsaren.'; return; }
  try {
    const access = await navigator.requestMIDIAccess();
    const hook = () => {
      const names = [];
      for (const input of access.inputs.values()) {
        names.push(input.name);
        input.onmidimessage = (m) => {
          const [st, d1, d2] = m.data;
          const cmd = st & 0xf0;
          if (cmd === 0x90 && d2 > 0) { ensureAudio(); synth.noteOn(d1, d2); keyboard.mark(d1, true); }
          else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) { synth.noteOff(d1); keyboard.mark(d1, false); }
          else if (cmd === 0xb0 && d1 === 64) synth.sustain(d2 >= 64);
          else if (cmd === 0xb0 && d1 === 1) synth.modWheel(d2 / 127);
          else if (cmd === 0xb0 && (d1 === 123 || d1 === 120)) synth.allOff();
          else if (cmd === 0xe0) synth.bend(((d2 << 7) | d1) / 8192 - 1);
          else if (cmd === 0xc0) selectVoice(d1 % bank.voices.length);
        };
      }
      status.textContent = names.length ? `MIDI-keyboard: ${names.join(', ')}` : 'MIDI-keyboard: inget anslutet.';
    };
    access.onstatechange = hook;
    hook();
  } catch (e) {
    status.textContent = 'MIDI-keyboard: åtkomst nekad.';
  }
}

// ---------- start ----------
let starting = null;
function ensureAudio() {
  if (synth.running) return Promise.resolve();
  if (!starting) {
    starting = synth.start().then(() => {
      $('startOverlay').classList.add('hidden');
    }).catch((err) => {
      toast('Ljudet kunde inte startas: ' + err.message);
    }).finally(() => { starting = null; });
  }
  return starting;
}
$('startBtn').addEventListener('click', () => ensureAudio());
document.addEventListener('pointerdown', () => { if (synth.node && synth.ctx.state !== 'running') synth.ctx.resume(); }, true);

synth.state.volume = settings.volume;
synth.state.bendRange = settings.bendRange;
renderBankSelect();
renderSettings();
selectVoice(voiceIndex, bank);
setupMidi();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.dx7 = { synth, keyboard }; // handy for debugging in the console
