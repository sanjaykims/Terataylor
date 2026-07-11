// Procedural ambient audio for the Coraline World — a dreamy, slightly eerie
// drone with sparkle chimes and a portal whoosh, all synthesized live via the
// Web Audio API. No audio files: nothing to download, no copyright, works
// offline. Browsers block audio until a user gesture, so start() must be called
// from a click/scroll handler.

class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private delay: DelayNode | null = null;
  private voices: OscillatorNode[] = [];
  on = false;

  private ensure(): boolean {
    if (this.ctx) return true;
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(this.ctx.destination);
    // A gentle feedback delay gives the chimes air and space.
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.34;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.3;
    this.delay.connect(fb); fb.connect(this.delay);
    this.delay.connect(this.master);
    return true;
  }

  /** Begin the ambient drone (call from a user gesture). */
  async start(): Promise<void> {
    if (!this.ensure() || !this.ctx || !this.master) return;
    try { await this.ctx.resume(); } catch { /* ignore */ }
    if (this.on) return;
    this.on = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 640;
    filter.Q.value = 0.7;
    const pad = this.ctx.createGain();
    pad.gain.value = 0.9;
    filter.connect(pad); pad.connect(this.master);

    // Open fifths, low and dreamy (A1 · E2 · A2 · E3).
    const freqs = [55, 82.41, 110, 164.81];
    freqs.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      g.gain.value = 0.5 / freqs.length;
      // Slow detune wobble so the drone breathes instead of sitting static.
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.017;
      const lg = this.ctx!.createGain();
      lg.gain.value = 1.5 + i;
      lfo.connect(lg); lg.connect(o.detune); lfo.start();
      o.connect(g); g.connect(filter); o.start();
      this.voices.push(o, lfo);
    });

    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.85, t + 2.5);
  }

  /** A soft bell from a major-pentatonic scale — used on each scene reveal. */
  chime(step?: number): void {
    if (!this.ctx || !this.master || !this.delay || !this.on) return;
    const scale = [0, 2, 4, 7, 9, 12, 14];
    const n = step ?? scale[Math.floor(Math.random() * scale.length)];
    const freq = 523.25 * Math.pow(2, n / 12); // C5 base
    const t = this.ctx.currentTime;
    [1, 2].forEach((mult, i) => {
      const o = this.ctx!.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const g = this.ctx!.createGain();
      const peak = i ? 0.05 : 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g); g.connect(this.master!); g.connect(this.delay!);
      o.start(t); o.stop(t + 1.7);
    });
  }

  /** A short filtered-noise sweep — the "stepping through the door" moment. */
  whoosh(): void {
    if (!this.ctx || !this.master || !this.on) return;
    const t = this.ctx.currentTime;
    const dur = 1.0;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(280, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master!);
    src.start(t); src.stop(t + dur);
  }

  /** Fade out and tear down (call when leaving the world). */
  stop(): void {
    if (!this.ctx || !this.master) { this.on = false; return; }
    this.on = false;
    const ctx = this.ctx, master = this.master, voices = this.voices;
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    } catch { /* ignore */ }
    this.voices = [];
    this.ctx = null; this.master = null; this.delay = null;
    setTimeout(() => {
      voices.forEach((o) => { try { o.stop(); } catch { /* ignore */ } });
      try { ctx.close(); } catch { /* ignore */ }
    }, 950);
  }
}

export const ambient = new AmbientAudio();
