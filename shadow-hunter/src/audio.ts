import type { GameEvent } from "./game";

export type SoundName = GameEvent | "click" | "buy" | "deny" | "bossintro";

const MUSIC_KEY = "shadowHunter.music";
const SFX_KEY = "shadowHunter.sfx";

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}
function saveFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* storage unavailable: the setting just won't persist */
  }
}

const A2 = 110;
const semis = (base: number, n: number) => base * Math.pow(2, n / 12);

/** Four-bar loop, Am - F - Dm - E: [bass root Hz, chord tones as semitones above A3]. */
const PROGRESSION: [number, number[]][] = [
  [semis(A2, 0), [0, 3, 7]],
  [semis(A2, -4), [-4, 0, 3]],
  [semis(A2, 5), [5, 8, 12]],
  [semis(A2, 7), [7, 11, 14]],
];
const BASS_STEPS = [0, 3, 6, 8, 10, 11, 14];
const ARP_ORDER = [0, 1, 2, 1, 0, 2, 1, 2];

/**
 * All sound is synthesised with Web Audio, so there are no audio files to ship or license.
 * The context is only created after a user gesture (the Start button), as browsers require.
 */
export class Sound {
  musicOn = loadFlag(MUSIC_KEY);
  sfxOn = loadFlag(SFX_KEY);
  private ctx: AudioContext | null = null;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private echo!: DelayNode;
  private noise!: AudioBuffer;
  private timer = 0;
  private nextStep = 0;
  private step = 0;
  private gemPitch = 0;
  /** Boss levels play the loop faster with a driving low stab. */
  private bossMode = false;
  private lastGem = 0;
  private lastShot = 0;

  constructor() {
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Call from a click/tap handler. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      const master = ctx.createDynamicsCompressor();
      master.connect(ctx.destination);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.5 : 0;
      this.musicGain.connect(master);
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 0.9 : 0;
      this.sfxGain.connect(master);
      this.echo = ctx.createDelay(1);
      this.echo.delayTime.value = (60 / 96) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      this.echo.connect(fb).connect(this.echo);
      this.echo.connect(this.musicGain);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
    if (this.musicOn) this.startMusic();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    saveFlag(MUSIC_KEY, on);
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.05);
    if (on) this.startMusic();
    else this.stopMusic();
  }

  setBossMode(on: boolean): void {
    this.bossMode = on;
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    saveFlag(SFX_KEY, on);
    if (this.ctx) this.sfxGain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxOn) return;
    const t = ctx.currentTime;
    switch (name) {
      case "click":
        this.tone("sine", 660, 990, t, 0.06, 0.25);
        break;
      case "shot": {
        // Several guards can fire in one frame; don't stack them into a roar.
        if (t - this.lastShot < 0.05) return;
        this.lastShot = t;
        this.noiseBurst(t, 0.14, "lowpass", 2600, 500, 0.5);
        this.tone("square", 160, 50, t, 0.08, 0.18);
        break;
      }
      case "kill":
        this.noiseBurst(t, 0.16, "bandpass", 4200, 700, 0.45);
        this.tone("sine", 140, 45, t + 0.04, 0.22, 0.55);
        break;
      case "gem": {
        // Rising pitch while gems keep arriving, like a combo.
        this.gemPitch = t - this.lastGem < 0.4 ? Math.min(this.gemPitch + 1, 10) : 0;
        this.lastGem = t;
        const f = semis(1046, this.gemPitch * 2);
        this.tone("sine", f, f * 1.5, t, 0.09, 0.18);
        this.tone("triangle", f * 2, f * 2, t + 0.02, 0.06, 0.06);
        break;
      }
      case "alert":
        this.tone("square", 880, 880, t, 0.07, 0.1);
        this.tone("square", 1175, 1175, t + 0.08, 0.1, 0.1);
        break;
      case "hurt":
        this.tone("sawtooth", 320, 80, t, 0.22, 0.28, 900);
        break;
      case "won":
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone("triangle", f, f, t + i * 0.09, 0.28, 0.25));
        break;
      case "lost":
        [392, 330, 262, 196].forEach((f, i) => this.tone("sawtooth", f, f * 0.97, t + i * 0.16, 0.3, 0.18, 1400));
        break;
      case "buy":
        // Coins tumbling, then a bright chord.
        for (let i = 0; i < 6; i++) this.tone("sine", 1400 + i * 180, 2200 + i * 180, t + i * 0.035, 0.07, 0.12);
        [784, 988, 1175].forEach((f) => this.tone("triangle", f, f, t + 0.22, 0.4, 0.15));
        break;
      case "bossintro":
        // Two low horn blasts.
        this.tone("sawtooth", 82, 78, t, 0.6, 0.3, 500);
        this.tone("sawtooth", 123, 117, t, 0.6, 0.18, 700);
        this.tone("sawtooth", 73, 65, t + 0.7, 0.9, 0.32, 450);
        this.tone("sawtooth", 110, 98, t + 0.7, 0.9, 0.18, 650);
        break;
      case "bosshit":
        this.noiseBurst(t, 0.2, "bandpass", 3000, 600, 0.5);
        this.tone("square", 220, 110, t, 0.12, 0.2, 2000);
        this.tone("sine", 90, 40, t + 0.03, 0.3, 0.6);
        break;
      case "bossdown":
        this.noiseBurst(t, 0.9, "lowpass", 3000, 120, 0.7);
        this.tone("sine", 120, 30, t, 0.8, 0.7);
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone("triangle", f, f, t + 0.45 + i * 0.08, 0.4, 0.22));
        break;
      case "deny":
        this.tone("square", 180, 150, t, 0.12, 0.14, 1200);
        this.tone("square", 140, 120, t + 0.13, 0.16, 0.14, 1200);
        break;
    }
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    t: number,
    dur: number,
    vol: number,
    lowpass = 0,
    out: AudioNode = this.sfxGain,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lowpass;
      node = node.connect(f);
    }
    node.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(
    t: number,
    dur: number,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    vol: number,
    out: AudioNode = this.sfxGain,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---- Music: a small look-ahead step sequencer ----

  private startMusic(): void {
    if (this.timer || !this.ctx) return;
    this.nextStep = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private stopMusic(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  private schedule(): void {
    const ctx = this.ctx!;
    const stepDur = 60 / (this.bossMode ? 122 : 96) / 4;
    while (this.nextStep < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextStep, stepDur);
      this.nextStep += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number, sd: number): void {
    const out = this.musicGain;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const [root, chord] = PROGRESSION[bar];

    if (s === 0 || s === 8 || (s === 6 && bar % 2 === 1)) this.tone("sine", 150, 42, t, 0.28, 0.75, 0, out);
    if (s === 4 || s === 12) this.noiseBurst(t, 0.12, "bandpass", 2000, 1200, 0.22, out);
    if (s % 2 === 1) this.noiseBurst(t, 0.04, "highpass", 8000, 7000, s % 4 === 3 ? 0.09 : 0.05, out);
    if (BASS_STEPS.includes(s)) this.tone("sawtooth", root, root, t, sd * 1.6, 0.2, 520, out);
    if (this.bossMode) {
      // Pounding eighth-note bass an octave down, plus a stab on every beat.
      if (s % 2 === 0) this.tone("square", root / 2, root / 2, t, sd * 0.9, 0.12, 380, out);
      if (s % 4 === 0) this.tone("sawtooth", root * 2, root * 2, t, sd * 0.6, 0.06, 1500, out);
    }
    if (s % 2 === 0) {
      const n = chord[ARP_ORDER[(s / 2) % ARP_ORDER.length]];
      const f = semis(220 * 2, n);
      this.tone("triangle", f, f, t, sd * 1.5, 0.07, 0, this.echo);
      this.tone("triangle", f, f, t, sd * 1.5, 0.05, 0, out);
    }
    if (s === 0) {
      // Soft pad holding the chord for the whole bar.
      for (const n of chord) {
        const f = semis(220, n);
        this.tone("sawtooth", f, f, t, sd * 16, 0.025, 800, out);
        this.tone("sawtooth", f * 1.004, f * 1.004, t, sd * 16, 0.02, 800, out);
      }
    }
  }
}
