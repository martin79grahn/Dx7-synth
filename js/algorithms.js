// The 32 DX7 algorithms. Operators are numbered 1-6 like on the DX7 panel.
// carriers: operators that are heard. mods: target -> operators that modulate it.
// fb: [operator receiving feedback, operator whose output is fed back].
// In every algorithm a modulator has a higher number than its target, so the
// engine can compute operators 6 -> 1 in one pass per sample.
export const ALGORITHMS = [
  { carriers: [1, 3], mods: { 1: [2], 3: [4], 4: [5], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 3], mods: { 1: [2], 3: [4], 4: [5], 5: [6] }, fb: [2, 2] },
  { carriers: [1, 4], mods: { 1: [2], 2: [3], 4: [5], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 4], mods: { 1: [2], 2: [3], 4: [5], 5: [6] }, fb: [6, 4] },
  { carriers: [1, 3, 5], mods: { 1: [2], 3: [4], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 3, 5], mods: { 1: [2], 3: [4], 5: [6] }, fb: [6, 5] },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5], 5: [6] }, fb: [4, 4] },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5], 5: [6] }, fb: [2, 2] },
  { carriers: [1, 4], mods: { 1: [2], 2: [3], 4: [5, 6] }, fb: [3, 3] },
  { carriers: [1, 4], mods: { 1: [2], 2: [3], 4: [5, 6] }, fb: [6, 6] },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5, 6] }, fb: [2, 2] },
  { carriers: [1, 3], mods: { 1: [2], 3: [4, 5, 6] }, fb: [6, 6] },
  { carriers: [1, 3], mods: { 1: [2], 3: [4], 4: [5, 6] }, fb: [6, 6] },
  { carriers: [1, 3], mods: { 1: [2], 3: [4], 4: [5, 6] }, fb: [2, 2] },
  { carriers: [1], mods: { 1: [2, 3, 5], 3: [4], 5: [6] }, fb: [6, 6] },
  { carriers: [1], mods: { 1: [2, 3, 5], 3: [4], 5: [6] }, fb: [2, 2] },
  { carriers: [1], mods: { 1: [2, 3, 4], 4: [5], 5: [6] }, fb: [3, 3] },
  { carriers: [1, 4, 5], mods: { 1: [2], 2: [3], 4: [6], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 2, 4], mods: { 1: [3], 2: [3], 4: [5, 6] }, fb: [3, 3] },
  { carriers: [1, 2, 4, 5], mods: { 1: [3], 2: [3], 4: [6], 5: [6] }, fb: [3, 3] },
  { carriers: [1, 3, 4, 5], mods: { 1: [2], 3: [6], 4: [6], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 2, 4, 5], mods: { 2: [3], 4: [6], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 2, 3, 4, 5], mods: { 3: [6], 4: [6], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 2, 3, 4, 5], mods: { 4: [6], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 2, 4], mods: { 2: [3], 4: [5, 6] }, fb: [6, 6] },
  { carriers: [1, 2, 4], mods: { 2: [3], 4: [5, 6] }, fb: [3, 3] },
  { carriers: [1, 3, 6], mods: { 1: [2], 3: [4], 4: [5] }, fb: [5, 5] },
  { carriers: [1, 2, 3, 5], mods: { 3: [4], 5: [6] }, fb: [6, 6] },
  { carriers: [1, 2, 3, 6], mods: { 3: [4], 4: [5] }, fb: [5, 5] },
  { carriers: [1, 2, 3, 4, 5], mods: { 5: [6] }, fb: [6, 6] },
  { carriers: [1, 2, 3, 4, 5, 6], mods: {}, fb: [6, 6] },
];
