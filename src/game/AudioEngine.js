/**
 * Synthesised deep-sea audio: ambient drone, bubbles, sonar ping, weapons,
 * creature sounds, heartbeat at low hull and a slow minor-key music loop.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    try { this.muted = localStorage.getItem('abyssal.muted') === '1'; } catch (_) { this.muted = false; }
    this.timer = null; this.step = 0; this.intensity = 0; this.lastShot = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    // underwater: everything goes through a gentle lowpass
    this.water = ctx.createBiquadFilter(); this.water.type = 'lowpass'; this.water.frequency.value = 5200;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(this.water); this.water.connect(comp); comp.connect(ctx.destination);
    // long echo for sonar and music
    this.echo = ctx.createGain(); this.echo.gain.value = 0.4;
    const dl = ctx.createDelay(2); dl.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.45;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.echo.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5; } // brown noise
    this.white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const w = this.white.getChannelData(0); for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    // ambient bed
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    this.amb = ctx.createGain(); this.amb.gain.value = 0;
    src.connect(f); f.connect(this.amb); this.amb.connect(this.master); src.start();
    const drone = ctx.createOscillator(); drone.type = 'sine'; drone.frequency.value = 55;
    const dg = ctx.createGain(); dg.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(dg.gain); drone.connect(dg); dg.connect(this.amb); drone.start(); lfo.start();
    // engine hum
    this.eng = ctx.createOscillator(); this.eng.type = 'triangle'; this.eng.frequency.value = 70;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    this.eng.connect(this.engG); this.engG.connect(this.master); this.eng.start();
    this.amb.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('abyssal.muted', m ? '1' : '0'); } catch (_) {}
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }
  drive(on, moveK) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engG.gain.setTargetAtTime(on ? 0.025 + moveK * 0.03 : 0, t, 0.15);
    this.eng.frequency.setTargetAtTime(62 + moveK * 30, t, 0.2);
  }
  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0, echo = 0.2, attack = 0.006 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    if (echo) { const s = this.ctx.createGain(); s.gain.value = echo; g.connect(s); s.connect(this.echo); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, { freq = 800, type = 'lowpass', vol = 0.3, q = 1, sweep = 0, delay = 0, white = false } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource(); src.buffer = white ? this.white : this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  shoot() {
    if (!this.ctx || this.ctx.currentTime - this.lastShot < 0.05) return;
    this.lastShot = this.ctx.currentTime;
    this.tone(1250 + Math.random() * 120, 0.09, { type: 'sine', vol: 0.06, slide: 0.45, echo: 0 });
    this.burst(0.05, { freq: 3000, type: 'bandpass', q: 2, vol: 0.05, white: true });
  }
  hit() { this.tone(380 + Math.random() * 60, 0.08, { type: 'triangle', vol: 0.07, slide: 0.6, echo: 0 }); }
  kill(big) {
    this.tone(big ? 220 : 520, big ? 0.5 : 0.22, { type: 'sine', vol: big ? 0.25 : 0.14, slide: 2.2, echo: 0.3 });
    this.burst(big ? 0.6 : 0.25, { freq: 1200, type: 'bandpass', q: 1.5, vol: big ? 0.35 : 0.18, sweep: 0.4 });
  }
  pickup(chain) { this.tone(880 * Math.pow(2, (chain % 8) / 12), 0.12, { type: 'sine', vol: 0.05, echo: 0.15 }); }
  kit() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.1, delay: i * 0.07 })); }
  hurt() { this.tone(90, 0.5, { type: 'sawtooth', vol: 0.3, slide: 0.5, echo: 0.1 }); this.burst(0.4, { freq: 600, vol: 0.5, sweep: 0.3 }); }
  dash() { this.burst(0.35, { freq: 400, type: 'bandpass', q: 1.2, vol: 0.35, sweep: 5 }); }
  sonar() { this.tone(1480, 1.8, { type: 'sine', vol: 0.22, echo: 0.9, attack: 0.002 }); this.tone(740, 0.8, { type: 'sine', vol: 0.08, echo: 0.5 }); }
  spore() { this.tone(300, 0.2, { type: 'sine', vol: 0.06, slide: 1.6, echo: 0 }); }
  darter() { this.burst(0.3, { freq: 900, type: 'bandpass', q: 3, vol: 0.12, sweep: 2.5 }); }
  roar() { this.tone(55, 1.6, { type: 'sawtooth', vol: 0.3, slide: 0.7, echo: 0.4, attack: 0.15 }); this.burst(1.4, { freq: 300, vol: 0.4, sweep: 0.4 }); }
  levelUp() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.1, delay: i * 0.07, echo: 0.4 })); }
  wave() { [262, 392].forEach((f, i) => this.tone(f, 0.6, { type: 'sine', vol: 0.12, delay: i * 0.18, echo: 0.6 })); }
  ui() { this.tone(900, 0.06, { type: 'triangle', vol: 0.05, echo: 0 }); }
  heartbeat() { this.tone(60, 0.15, { type: 'sine', vol: 0.35, echo: 0 }); this.tone(55, 0.15, { type: 'sine', vol: 0.25, delay: 0.18, echo: 0 }); }
  over() { [330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.9, { type: 'sine', vol: 0.12, delay: i * 0.3, echo: 0.6 })); }

  startMusic() { if (!this.ctx || this.timer) return; this.next = this.ctx.currentTime + 0.1; this.timer = setInterval(() => this.schedule(), 30); }
  stopMusic() { clearInterval(this.timer); this.timer = null; }
  schedule() {
    const spb = 60 / 84 / 2; // eighth notes, 84 bpm
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    // Dm - Bb - F - C
    const roots = [38, 34, 41, 36];
    const arps = [[62, 65, 69, 74], [58, 62, 65, 70], [60, 65, 69, 72], [60, 64, 67, 72]];
    while (this.next < this.ctx.currentTime + 0.15) {
      const s = this.step % 32, bar = (s / 8) | 0, delay = Math.max(0, this.next - this.ctx.currentTime);
      if (s % 8 === 0) { this.tone(mtof(roots[bar]), 3.2, { type: 'sine', vol: 0.09, delay, echo: 0.2, attack: 0.3 }); this.tone(mtof(roots[bar] + 12), 3, { type: 'triangle', vol: 0.025, delay, echo: 0.5, attack: 0.5 }); }
      const a = arps[bar];
      if (this.intensity > 0.15 || s % 2 === 0) this.tone(mtof(a[(s * 3) % 4] + (s % 16 > 11 ? 12 : 0)), 0.5, { type: 'sine', vol: 0.02 + this.intensity * 0.025, delay, echo: 0.8 });
      if (this.intensity > 0.45 && s % 4 === 2) this.burst(0.06, { freq: 7000, type: 'highpass', vol: 0.03, delay, white: true });
      if (this.intensity > 0.3 && s % 8 === 4) this.tone(70, 0.25, { type: 'sine', vol: 0.14, slide: 0.5, delay, echo: 0 });
      this.next += spb; this.step++;
    }
  }
}
