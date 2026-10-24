// Draws a DX7 algorithm as an SVG diagram: carriers on the bottom row,
// modulators stacked above the operators they modulate.
import { ALGORITHMS } from './algorithms.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs, parent) => {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

export function layoutAlgorithm(index) {
  const a = ALGORITHMS[index];
  const mods = (op) => a.mods[op] || [];
  const targets = {};
  for (let op = 1; op <= 6; op++) targets[op] = [];
  for (const t in a.mods) for (const m of a.mods[t]) targets[m].push(+t);

  const row = {};
  for (let op = 1; op <= 6; op++) row[op] = targets[op].length ? 1 + Math.max(...targets[op].map((t) => row[t])) : 0;

  // tree layout: each modulator belongs to its lowest-numbered target
  const children = (op) => mods(op).filter((m) => Math.min(...targets[m]) === op);
  const width = (op) => Math.max(1, children(op).reduce((s, c) => s + width(c), 0));
  const x = {};
  const place = (op, left) => {
    const w = width(op);
    x[op] = left + w / 2;
    let l = left;
    for (const c of children(op)) { place(c, l); l += width(c); }
  };
  let left = 0;
  for (const c of a.carriers) { place(c, left); left += width(c); }
  for (let op = 6; op >= 1; op--) {
    if (targets[op].length > 1) x[op] = targets[op].reduce((s, t) => s + x[t], 0) / targets[op].length;
  }
  return { a, row, x, cols: left, targets };
}

export function drawAlgorithm(svg, index, { selected = 0, enabled = [], onSelect } = {}) {
  svg.innerHTML = '';
  const { a, row, x, cols, targets } = layoutAlgorithm(index);
  const W = 240;
  const maxRow = Math.max(...Object.values(row));
  const rowH = 40;
  const H = 30 + (maxRow + 1) * rowH + 22;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const colW = Math.min(46, (W - 30) / cols);
  const x0 = (W - colW * cols) / 2;
  const bw = Math.min(30, colW - 8), bh = Math.min(26, rowH - 12);
  const busY = H - 22;
  const pos = {};
  for (let op = 1; op <= 6; op++) pos[op] = { x: x0 + x[op] * colW, y: busY - 26 - row[op] * rowH };

  el('text', { x: 8, y: 16, fill: 'currentColor', 'font-size': 12, 'font-weight': 700, style: 'fill: var(--muted)' }, svg)
    .textContent = `ALG ${index + 1}`;

  // modulation lines
  for (const t in a.mods) {
    for (const m of a.mods[t]) {
      const p = pos[m], q = pos[t];
      el('path', { class: 'alg-line', d: `M${p.x},${p.y + bh / 2} L${p.x},${p.y + bh / 2 + 6} L${q.x},${q.y - bh / 2 - 6} L${q.x},${q.y - bh / 2}` }, svg);
    }
  }
  // output bus
  const cx = a.carriers.map((c) => pos[c].x);
  el('path', { class: 'alg-line', d: `M${Math.min(...cx)},${busY} L${Math.max(...cx)},${busY}` }, svg);
  for (const c of a.carriers) el('path', { class: 'alg-line', d: `M${pos[c].x},${pos[c].y + bh / 2} L${pos[c].x},${busY}` }, svg);
  const mid = (Math.min(...cx) + Math.max(...cx)) / 2;
  el('path', { class: 'alg-line', d: `M${mid},${busY} L${mid},${busY + 12} M${mid - 4},${busY + 7} L${mid},${busY + 12} L${mid + 4},${busY + 7}` }, svg);

  // feedback loop from source output back to destination input
  const [dst, src] = a.fb;
  const s = pos[src], d = pos[dst];
  const fx = Math.max(s.x, d.x) + bw / 2 + 7;
  el('path', { class: 'alg-fb', d: `M${s.x},${s.y + bh / 2} L${s.x},${s.y + bh / 2 + 5} L${fx},${s.y + bh / 2 + 5} L${fx},${d.y - bh / 2 - 5} L${d.x},${d.y - bh / 2 - 5} L${d.x},${d.y - bh / 2}` }, svg);

  for (let op = 1; op <= 6; op++) {
    const cls = ['alg-op'];
    if (a.carriers.includes(op)) cls.push('carrier');
    if (selected === op - 1) cls.push('sel');
    if (enabled.length && !enabled[op - 1]) cls.push('off');
    const g = el('g', { class: cls.join(' '), style: 'cursor:pointer' }, svg);
    el('rect', { x: pos[op].x - bw / 2, y: pos[op].y - bh / 2, width: bw, height: bh, rx: 3 }, g);
    el('text', { x: pos[op].x, y: pos[op].y }, g).textContent = op;
    if (onSelect) g.addEventListener('click', () => onSelect(op - 1));
  }
  return { carriers: a.carriers, targets };
}
