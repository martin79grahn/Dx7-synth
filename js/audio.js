// Wraps the AudioContext and the DX7 AudioWorklet node.
import { ALGORITHMS } from './algorithms.js';

export class Synth {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.state = { patch: null, volume: 0.8, bendRange: 2 };
  }

  get running() { return !!this.node && this.ctx.state === 'running'; }

  async start() {
    if (this.node) { await this.ctx.resume(); return; }
    // iOS: play through the ringer/silent switch
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule('js/dx7-worklet.js');
    this.node = new AudioWorkletNode(this.ctx, 'dx7', {
      numberOfInputs: 0,
      outputChannelCount: [2],
      processorOptions: { algorithms: ALGORITHMS },
    });
    this.node.connect(this.ctx.destination);
    if (this.state.patch) this.send({ type: 'patch', patch: this.state.patch });
    this.send({ type: 'volume', value: this.state.volume });
    this.send({ type: 'bendRange', value: this.state.bendRange });
    await this.ctx.resume();
    // Resume after the app returns from the background
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx.state !== 'running') this.ctx.resume();
    });
  }

  send(msg) { if (this.node) this.node.port.postMessage(msg); }

  setPatch(patch) { this.state.patch = patch; this.send({ type: 'patch', patch }); }
  setVolume(v) { this.state.volume = v; this.send({ type: 'volume', value: v }); }
  setBendRange(v) { this.state.bendRange = v; this.send({ type: 'bendRange', value: v }); }
  noteOn(note, velocity) { this.send({ type: 'noteOn', note, velocity }); }
  noteOff(note) { this.send({ type: 'noteOff', note }); }
  sustain(on) { this.send({ type: 'sustain', on }); }
  bend(value) { this.send({ type: 'bend', value }); }
  modWheel(value) { this.send({ type: 'modWheel', value }); }
  allOff() { this.send({ type: 'allOff' }); }
}
