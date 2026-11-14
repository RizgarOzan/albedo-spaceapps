// Sun elevation -> pitch (log scale 110..880 Hz over -2..8 deg); silent while the Sun is behind terrain.
export function pitchHz(elDeg) {
  const t = (Math.max(-2, Math.min(8, elDeg)) + 2) / 10;
  return 110 * Math.pow(8, t);
}

export class Sonifier {
  constructor() { this.ctx = null; this.osc = null; this.gain = null; this.started = false; }
  get on() { return this.started; }
  start() {
    if (this.started) return true;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    this.ctx = new AC(); this.osc = this.ctx.createOscillator(); this.gain = this.ctx.createGain();
    this.osc.type = 'sine'; this.osc.frequency.value = pitchHz(0); this.gain.gain.value = 0;
    this.osc.connect(this.gain); this.gain.connect(this.ctx.destination); this.osc.start();
    this.started = true; return true;
  }
  update(sunElDeg, sunVisible) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.osc.frequency.setTargetAtTime(pitchHz(sunElDeg), t, 0.05);
    this.gain.gain.setTargetAtTime(sunVisible ? 0.08 : 0, t, 0.05);
  }
  stop() {
    if (!this.started) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    const ctx = this.ctx; this.started = false;
    setTimeout(() => ctx.close(), 250);
  }
}
