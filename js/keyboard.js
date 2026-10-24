// Multi-touch on-screen piano keyboard with glissando and touch-position velocity.
const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (n) => NAMES[n % 12] + (Math.floor(n / 12) - 1);

export class Keyboard {
  constructor(el, { onNoteOn, onNoteOff }) {
    this.el = el;
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.startNote = 48;
    this.keyWidth = 46;
    this.velocityByPosition = true;
    this.pointers = new Map(); // pointerId -> note
    this.held = new Map(); // note -> count of pointers/sources holding it
    this.keyEls = new Map();
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(() => this.build()).observe(el);
  }

  setStart(note) { this.releaseAll(); this.startNote = note; this.build(); }

  build() {
    const width = this.el.clientWidth || window.innerWidth;
    const whiteCount = Math.max(7, Math.min(36, Math.round(width / this.keyWidth)));
    if (this.built === `${whiteCount}:${this.startNote}`) return;
    this.built = `${whiteCount}:${this.startNote}`;
    this.el.innerHTML = '';
    this.keyEls.clear();
    let note = this.startNote;
    let w = 0;
    const blackW = 62 / whiteCount;
    while (w < whiteCount) {
      if (BLACK.has(note % 12)) {
        const k = document.createElement('div');
        k.className = 'key-black';
        k.style.left = `calc(${(w / whiteCount) * 100}% - ${blackW / 2}% + 2px)`;
        k.style.width = `${blackW}%`;
        this.addKey(k, note);
      } else {
        const k = document.createElement('div');
        k.className = 'key-white';
        if (note % 12 === 0) {
          const lab = document.createElement('span');
          lab.className = 'key-label';
          lab.textContent = noteName(note);
          k.appendChild(lab);
        }
        this.addKey(k, note);
        w++;
      }
      note++;
    }
    for (const n of this.held.keys()) this.mark(n, true);
  }

  addKey(k, note) {
    k.dataset.note = note;
    this.el.appendChild(k);
    this.keyEls.set(note, k);
  }

  keyAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const key = el && el.closest && el.closest('[data-note]');
    if (!key || !this.el.contains(key)) return null;
    const r = key.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (y - r.top) / r.height));
    return { note: +key.dataset.note, velocity: this.velocityByPosition ? Math.round(35 + frac * 92) : 100 };
  }

  down(e) {
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const k = this.keyAt(e.clientX, e.clientY);
    if (!k) return;
    this.pointers.set(e.pointerId, k.note);
    this.press(k.note, k.velocity);
  }

  move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const k = this.keyAt(e.clientX, e.clientY);
    const cur = this.pointers.get(e.pointerId);
    if (!k || k.note === cur) return;
    this.release(cur);
    this.pointers.set(e.pointerId, k.note);
    this.press(k.note, k.velocity);
  }

  up(e) {
    const n = this.pointers.get(e.pointerId);
    if (n === undefined) return;
    this.pointers.delete(e.pointerId);
    this.release(n);
  }

  press(note, velocity) {
    const c = this.held.get(note) || 0;
    this.held.set(note, c + 1);
    if (c === 0) { this.mark(note, true); this.onNoteOn(note, velocity); }
  }

  release(note) {
    const c = this.held.get(note) || 0;
    if (c <= 1) { this.held.delete(note); this.mark(note, false); if (c === 1) this.onNoteOff(note); }
    else this.held.set(note, c - 1);
  }

  releaseAll() {
    for (const n of [...this.held.keys()]) { this.held.set(n, 1); this.release(n); }
    this.pointers.clear();
  }

  mark(note, on) {
    const k = this.keyEls.get(note);
    if (k) k.classList.toggle('down', on);
  }
}
