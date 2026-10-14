// Synthesized Web Audio API for classic Gunny sound effects

class AudioManager {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Play click / select item sound
  playClick() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  // Spacebar charging tick sound (continuous ticking while charging)
  playChargeTick(pitchRatio: number = 1) {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 440 + pitchRatio * 440;
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq + 60, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }

  // Normal projectile shoot whoosh
  playShoot() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(950, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  // POW (Nộ) shoot sound with dramatic deep sweep
  playPowShoot() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';

    osc1.frequency.setValueAtTime(120, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);

    osc2.frequency.setValueAtTime(240, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.4);
  }

  // Explosion boom
  playExplode(isBig: boolean = false) {
    const ctx = this.getContext();
    if (!ctx) return;

    // White noise explosion
    const bufferSize = ctx.sampleRate * (isBig ? 0.6 : 0.4);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter to give that bass boom
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isBig ? 450 : 350, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + (isBig ? 0.6 : 0.4));

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isBig ? 0.4 : 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (isBig ? 0.6 : 0.4));

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
  }

  // Critical Hit fanfare
  playCrit() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);

      gain.gain.setValueAtTime(0.2, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.15);
    });
  }

  // Heal sound
  playHeal() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [400, 550, 700, 900].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      gain.gain.setValueAtTime(0.18, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.06 + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.2);
    });
  }

  // "It is your turn": two short, clear beeps
  playYourTurn() {
    const ctx = this.getContext();
    if (!ctx || !this.enabled) return;
    const now = ctx.currentTime;
    [0, 0.2].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1175, now + t);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.18, now + t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.16);
    });
  }

  // Turn Change chime (Ding-dong)
  playTurnChange() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [587.33, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.2, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.3);
    });
  }

  // Airplane flight sound
  playAirplane() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.3);
    osc.frequency.linearRampToValueAtTime(450, ctx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  }

  // Enhance upgrade success fanfare
  playEnhanceSuccess() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const melody = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    melody.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(0.25, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.3);
    });
  }

  /** One enveloped note: `type` wave gliding from `from` to `to` Hz over `dur` s, starting `at` s from now, peak gain `vol`. */
  private tone(ctx: AudioContext, type: OscillatorType, from: number, to: number, at: number, dur: number, vol: number) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Shell hits a gift box: a short dry "bốp" (the cheer comes later, only for a right answer)
  playBoxHit() {
    const ctx = this.getContext();
    if (!ctx) return;
    this.tone(ctx, 'sine', 220, 70, 0, 0.13, 0.28);
    this.tone(ctx, 'square', 1400, 500, 0, 0.05, 0.1);
  }

  // Right answer: bright rising fanfare
  playCheer() {
    const ctx = this.getContext();
    if (!ctx) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, i) => this.tone(ctx, 'triangle', freq, freq, i * 0.07, 0.28, 0.22));
  }

  // Wrong answer: two sagging "wah-wah" notes
  playWrong() {
    const ctx = this.getContext();
    if (!ctx) return;
    this.tone(ctx, 'sawtooth', 330, 250, 0, 0.27, 0.16);
    this.tone(ctx, 'sawtooth', 262, 170, 0.28, 0.27, 0.16);
  }

  // Auto-battle charge-up: a soft rising "chiu chiu" that ends the moment the shell flies (stopChargeUp)
  private charge: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

  playChargeUp(durationMs: number = 1300) {
    const ctx = this.getContext();
    if (!ctx) return;
    this.stopChargeUp(0.02);
    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    const hardStop = now + dur + 0.3; // safety: never longer than the charge + 0.3 s even if the stop event is lost
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.12);
    lfo.frequency.value = 14;
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    lfo.start(now);
    osc.stop(hardStop);
    lfo.stop(hardStop);
    this.charge = { osc, lfo, gain };
  }

  stopChargeUp(fadeSec: number = 0.1) {
    const node = this.charge;
    const ctx = this.ctx;
    this.charge = null;
    if (!node || !ctx) return;
    const t = ctx.currentTime;
    try {
      node.gain.gain.cancelScheduledValues(t);
      node.gain.gain.setValueAtTime(Math.max(node.gain.gain.value, 0.0001), t);
      node.gain.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
      node.osc.stop(t + fadeSec);
      node.lfo.stop(t + fadeSec);
    } catch {
      /* already stopped */
    }
  }

  // Shell hits a player: heavier than a normal explosion (boom + low thump)
  playHitPlayer() {
    const ctx = this.getContext();
    if (!ctx) return;
    this.playExplode(true);
    this.tone(ctx, 'sine', 110, 38, 0, 0.4, 0.38);
  }
}

export const soundManager = new AudioManager();
