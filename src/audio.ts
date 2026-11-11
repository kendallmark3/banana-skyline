/** Tiny synthesised sound effects (Web Audio). No audio files. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    if (this.muted) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, from: number, to: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
  }

  tick() {
    this.tone(880, 0.03, 'square', 0.03);
  }
  throw() {
    this.tone(260, 0.28, 'triangle', 0.14, 780);
    this.noise(0.22, 0.05, 600, 3000);
  }
  thud() {
    this.noise(0.3, 0.3, 1400, 120);
    this.tone(120, 0.25, 'sine', 0.3, 45);
  }
  miss() {
    this.tone(330, 0.3, 'triangle', 0.1, 150);
  }
  boom() {
    this.noise(0.9, 0.45, 2600, 60);
    this.tone(180, 0.7, 'sawtooth', 0.18, 30);
  }
  win(long = false, delay = 0.45) {
    const notes = long ? [523, 659, 784, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.16, 'square', 0.08, undefined, delay + i * 0.13));
  }
  /** Chest-pound. */
  thump(delay: number) {
    this.tone(95, 0.1, 'sine', 0.4, 48, delay);
  }
  chomp(delay: number) {
    this.noise(0.07, 0.22, 2600, 700, delay);
    this.tone(240, 0.05, 'square', 0.05, 120, delay);
  }
  whee(delay: number) {
    this.tone(400, 0.5, 'triangle', 0.1, 1400, delay);
  }
}
