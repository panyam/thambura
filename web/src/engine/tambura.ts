import type { ThamburaSettings } from "./shruthi";

/**
 * Tambura sound synthesis. Pure: each function returns samples or spectra and
 * the player turns them into Web Audio buffers and oscillators.
 *
 * A pluck is a sum of harmonics. Each one decays at its own rate (the high
 * ones faster). Two models stand in for the jawari, the curved bridge that
 * makes a real tambura's tone bloom and buzz:
 *
 * - The jawari voice, fitted to a recording of a C tambura (issue #8), starts
 *   dark and boosts a band of harmonics around 1.3 kHz by up to about 40 dB.
 *   The boost swells over the first second, peaks around 1.4 s, falls back
 *   within the next second and leaves a little brightness behind.
 * - The classic tambura voice sweeps a resonance slowly down through the
 *   harmonics and rings with its high harmonics for many seconds, so each
 *   string is still sounding when the next round comes.
 *
 * The guitar voice uses the classic model, shorter and dulling quickly.
 */

/** How one string sounds, derived from the settings by `pluckVoice`. */
export interface PluckVoice {
  /** Harmonic k starts at 1/k^rolloff (times the pluck-position shape). */
  rolloff: number;
  /** Where along the string it is plucked, as a fraction of its length. */
  pluckAt: number;
  /** Seconds for the fundamental to fall 60 dB. */
  ringSeconds: number;
  /** How much faster each harmonic above the fundamental decays. */
  damping: number;
  /** Attack time, in seconds. */
  attack: number;
  /** The jawari resonance sweeps from this harmonic number down to `sweepTo`. */
  sweepFrom: number;
  sweepTo: number;
  /** Time constant of the sweep, in seconds. */
  sweepSeconds: number;
  /** Width of the resonance, in harmonics. */
  sweepWidth: number;
  /** Extra gain at the resonance's centre. */
  bloom: number;
  /** How far the resonance wanders back and forth, in harmonics (the shimmer). */
  shimmer: number;
  /** Extra high harmonics at the very start, from a firm pluck. */
  bite: number;
  /** 0-1: how far below full the upper harmonics start before swelling in. */
  swell: number;
  /**
   * The jawari voice's bloom: harmonics near `formantHz` (a Gaussian
   * `formantOctaves` wide on a log-frequency scale) are boosted by up to
   * `formantDb`. The boost rises with time constant `formantRise`, holds until
   * `formantHold`, falls away over about `formantFall` seconds and settles at
   * `formantRest` of its peak (in dB). 0 dB turns it off.
   */
  formantHz: number;
  formantOctaves: number;
  formantDb: number;
  formantRise: number;
  formantHold: number;
  formantFall: number;
  formantRest: number;
  /**
   * 0-1: how much of the bloom is new energy. At 0 the bloom only moves
   * energy up into the boosted harmonics, as a jawari does, and the note gets
   * no louder; at 1 the boost is all added on top.
   */
  formantEnergy: number;
  /**
   * 0 scales the render so its peak is 0.8. Otherwise the RMS over the
   * first 0.1 s is scaled to this, so every string is plucked equally hard
   * and a bloom rises above the attack by its own amount (it can exceed 1).
   */
  attackLevel: number;
  /** Render length, in seconds. */
  seconds: number;
  /** Fade at the end of the render, in seconds. */
  tailFade: number;
  maxPartials: number;
  maxPartialHz: number;
}

/** Longest guitar pluck rendered. Longer rings are cut with a short fade. */
export const MAX_PLUCK_SECONDS = 6;
/**
 * Longest tambura pluck rendered: a little over the slowest round (8 s), since
 * the same string's next pluck takes over from it.
 */
export const MAX_TAMBURA_SECONDS = 9;

// Envelopes are computed every BLOCK samples and interpolated in between.
const BLOCK = 64;
// The bloom's energy correction is computed every COMP_STEP blocks (about 20 ms at 48 kHz).
const COMP_STEP = 16;
const PEAK = 0.8;
/** The jawari voice's attack RMS, set so its mix is as loud as the classic's. */
export const ATTACK_LEVEL = 0.18;

// No bloom, for the voices that don't use it.
const NO_FORMANT = {
  formantHz: 1000,
  formantOctaves: 1,
  formantDb: 0,
  formantRise: 1,
  formantHold: 0,
  formantFall: 1,
  formantRest: 0,
  formantEnergy: 1,
  attackLevel: 0,
};

/**
 * The pluck character for the settings and one string (0 first, 1-2 Sa, 3
 * low Sa). The gents tambura is the bigger, darker, longer-ringing
 * instrument; ladies' is brighter and a little shorter. Sruti mode has no
 * plucks and gets the classic tambura voice. Only the jawari voice differs
 * by string: its low Sa, a thicker string, blooms about half as much.
 */
export function pluckVoice(
  s: Pick<ThamburaSettings, "mode" | "voice" | "tone" | "pluck" | "sustain">,
  string = 0,
): PluckVoice {
  const ladies = s.voice === "ladies";
  const b = Math.min(1, s.tone / 100 + (ladies ? 0.1 : 0));
  const f = s.pluck / 100;
  const sustain = s.sustain / 100;
  const pluckAt = (at: number) => at + 0.001 * Math.SQRT2; // irrational, so no harmonic vanishes

  if (s.mode === "jawari") {
    // Fitted at tone, pluck 50 and sustain 60 (gents): rolloff 1.5, ring 36 s,
    // a 42 dB bloom at 1.3 kHz on the steel strings, 22 dB on the low Sa.
    const ringSeconds = (18 + 30 * sustain) * (ladies ? 0.85 : 1);
    return {
      rolloff: 1.7 - 0.4 * b,
      pluckAt: pluckAt(0.12 - 0.04 * f),
      ringSeconds,
      damping: 0.01,
      attack: 0.01 - 0.006 * f,
      sweepFrom: 1,
      sweepTo: 1,
      sweepSeconds: 1,
      sweepWidth: 1,
      bloom: 0,
      shimmer: 0,
      bite: 0,
      swell: 0,
      formantHz: 1100 + 400 * b,
      formantOctaves: 1.2,
      formantDb: (34 + 16 * f) * (string === 3 ? 0.52 : 1),
      formantRise: 0.5,
      formantHold: 1.4,
      formantFall: 0.6,
      formantRest: 0.3,
      formantEnergy: 0.3,
      attackLevel: ATTACK_LEVEL,
      seconds: Math.min(ringSeconds, MAX_TAMBURA_SECONDS),
      tailFade: 0.3,
      maxPartials: 64,
      maxPartialHz: 8000,
    };
  }

  if (s.mode === "guitar") {
    const ringSeconds = (2.5 + 5.5 * sustain) * (ladies ? 0.85 : 1);
    return {
      rolloff: 1.7 - 0.9 * b,
      pluckAt: pluckAt(0.13 - 0.05 * f),
      ringSeconds,
      damping: 0.06 + 0.12 * (1 - b),
      attack: 0.012 - 0.009 * f,
      sweepFrom: 12 + 10 * b,
      sweepTo: 3,
      sweepSeconds: 0.25 * ringSeconds,
      sweepWidth: 2.5,
      bloom: 2 * (ladies ? 0.7 : 0.85),
      shimmer: 0,
      bite: 1.5 * f,
      swell: 0,
      ...NO_FORMANT,
      seconds: Math.min(ringSeconds, MAX_PLUCK_SECONDS),
      tailFade: 0.05,
      maxPartials: 48,
      maxPartialHz: 10000,
    };
  }

  const ringSeconds = (12 + 24 * sustain) * (ladies ? 0.85 : 1);
  return {
    rolloff: 1.25 - 0.5 * b,
    pluckAt: pluckAt(0.11 - 0.04 * f),
    ringSeconds,
    damping: 0.012 + 0.03 * (1 - b),
    attack: 0.01 - 0.006 * f,
    sweepFrom: 28 + 10 * b,
    sweepTo: 5,
    sweepSeconds: 0.3 * ringSeconds,
    sweepWidth: 4,
    bloom: ladies ? 2 : 2.4,
    shimmer: 1.5,
    bite: 0.6 * f,
    swell: 0.6,
    ...NO_FORMANT,
    seconds: Math.min(ringSeconds, MAX_TAMBURA_SECONDS),
    tailFade: 0.3,
    maxPartials: 64,
    maxPartialHz: 8000,
  };
}

/**
 * One string's pluck, mono, scaled as `voice.attackLevel` says. `seed` sets the harmonics' starting
 * phases, so the same arguments always give the same samples.
 */
export function renderPluck(freq: number, sampleRate: number, voice: PluckVoice, seed = 1): Float32Array {
  const r = new PluckRender(freq, sampleRate, voice, seed);
  r.step();
  return r.result();
}

/**
 * A pluck rendered a few harmonics at a time, so a long render can be spread
 * over several calls without holding up the main thread. The result is the
 * same as `renderPluck`'s however the work is sliced.
 */
export class PluckRender {
  readonly length: number;
  readonly partials: number;
  private readonly acc: Float64Array;
  private readonly rng: () => number;
  // Per block boundary, the bloom's time shape (0-1) and energy correction
  // (see formantEnergy); null without a bloom.
  private readonly shape: Float64Array | null;
  private readonly comp: Float64Array | null;
  private next = 1;

  constructor(
    private readonly freq: number,
    private readonly sampleRate: number,
    private readonly voice: PluckVoice,
    seed = 1,
  ) {
    this.length = Math.max(BLOCK, Math.ceil(voice.seconds * sampleRate));
    const limitHz = Math.min(voice.maxPartialHz, 0.45 * sampleRate);
    this.partials = Math.max(1, Math.min(voice.maxPartials, Math.floor(limitHz / freq)));
    this.acc = new Float64Array(this.length);
    this.rng = mulberry32(seed);
    this.shape = voice.formantDb === 0 ? null : this.formantShape();
    this.comp = voice.formantDb === 0 ? null : this.energyCorrection();
  }

  /** Total work, in harmonic-samples; `step`'s budget is in the same unit. */
  get work(): number {
    return this.partials * this.length;
  }

  get done(): boolean {
    return this.next > this.partials;
  }

  /**
   * Renders whole harmonics until about `budget` harmonic-samples are done
   * (always at least one). Returns true once every harmonic is rendered.
   */
  step(budget = Infinity): boolean {
    let spent = 0;
    while (!this.done && (spent === 0 || spent + this.length <= budget)) {
      this.renderPartial(this.next++);
      spent += this.length;
    }
    return this.done;
  }

  /** The finished pluck. Only valid once `step` has returned true. */
  result(): Float32Array {
    const { acc, length } = this;
    const fade = Math.min(length, Math.round(this.voice.tailFade * this.sampleRate));
    for (let i = 0; i < fade; i++) acc[length - 1 - i] *= i / fade;
    const out = new Float32Array(length);
    const scale = this.voice.attackLevel > 0 ? this.attackScale() : this.peakScale();
    for (let i = 0; i < length; i++) out[i] = acc[i] * scale;
    return out;
  }

  private peakScale(): number {
    let peak = 0;
    for (let i = 0; i < this.length; i++) peak = Math.max(peak, Math.abs(this.acc[i]));
    return peak > 0 ? PEAK / peak : 0;
  }

  private attackScale(): number {
    const n = Math.min(this.length, Math.round(0.1 * this.sampleRate));
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.acc[i] * this.acc[i];
    const rms = Math.sqrt(sum / n);
    return rms > 0 ? this.voice.attackLevel / rms : 0;
  }

  private base(k: number): number {
    return Math.abs(Math.sin(Math.PI * k * this.voice.pluckAt)) / k ** this.voice.rolloff;
  }

  private tau(k: number): number {
    return this.voice.ringSeconds / Math.log(1000) / (1 + this.voice.damping * (k - 1));
  }

  private blockTime(b: number): number {
    return Math.min(this.length, b * BLOCK) / this.sampleRate;
  }

  /** Harmonic k's peak bloom, in dB. */
  private formantWeight(k: number): number {
    const v = this.voice;
    return v.formantDb * Math.exp(-0.5 * (Math.log2((k * this.freq) / v.formantHz) / v.formantOctaves) ** 2);
  }

  private formantShape(): Float64Array {
    const v = this.voice;
    const shape = new Float64Array(Math.ceil(this.length / BLOCK) + 1);
    for (let b = 0; b < shape.length; b++) {
      const t = this.blockTime(b);
      const fall = Math.exp(-((Math.max(0, t - v.formantHold) / v.formantFall) ** 2));
      shape[b] = (1 - Math.exp(-t / v.formantRise)) * (v.formantRest + (1 - v.formantRest) * fall);
    }
    return shape;
  }

  /**
   * Per block boundary, the gain that takes back the share of the bloom's
   * added energy that `formantEnergy` leaves out, from the harmonics'
   * energy with and without the bloom. It changes slowly, so it is worked out
   * every COMP_STEP blocks and interpolated.
   */
  private energyCorrection(): Float64Array {
    const shape = this.shape!;
    const comp = new Float64Array(shape.length);
    const keep = (1 - this.voice.formantEnergy) / 2;
    const ks = Array.from({ length: this.partials }, (_, i) => i + 1);
    const base2 = ks.map((k) => this.base(k) ** 2);
    const rate = ks.map((k) => 2 / this.tau(k));
    const weight = ks.map((k) => this.formantWeight(k) / 10);
    const at = (b: number) => {
      const t = this.blockTime(b);
      let plain = 0;
      let bloomed = 0;
      for (let i = 0; i < ks.length; i++) {
        const e = base2[i] * Math.exp(-t * rate[i]);
        plain += e;
        bloomed += e * 10 ** (weight[i] * shape[b]);
      }
      return bloomed > 0 ? (plain / bloomed) ** keep : 1;
    };
    const last = comp.length - 1;
    for (let b = 0; b < last; b += COMP_STEP) {
      const c0 = at(b);
      const b1 = Math.min(last, b + COMP_STEP);
      const c1 = at(b1);
      for (let j = b; j <= b1; j++) comp[j] = c0 + ((c1 - c0) * (j - b)) / (b1 - b);
    }
    if (last === 0) comp[0] = at(0);
    return comp;
  }

  private renderPartial(k: number): void {
    const v = this.voice;
    const { acc, length, sampleRate, comp, shape } = this;
    const base = this.base(k);
    const tau = this.tau(k);
    const upper = k > 3;
    const weight = shape ? this.formantWeight(k) / 20 : 0;
    // `b` is the block boundary t falls on, for the energy correction.
    const envelope = (t: number, b: number) => {
      const wander = v.shimmer * Math.sin((2 * Math.PI * t) / 2.3);
      const centre = v.sweepTo + (v.sweepFrom - v.sweepTo) * Math.exp(-t / v.sweepSeconds) + wander;
      const bloom = 1 + v.bloom * Math.exp(-0.5 * ((k - centre) / v.sweepWidth) ** 2);
      const edge = k > 4 ? 1 + v.bite * Math.exp(-t / 0.04) : 1;
      const swell = upper ? 1 - v.swell * Math.exp(-t / 0.25) : 1;
      const rise = t < v.attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / v.attack) : 1;
      const formant = shape && comp ? 10 ** (weight * shape[b]) * comp[b] : 1;
      return base * Math.exp(-t / tau) * bloom * edge * swell * rise * formant;
    };

    const w = (2 * Math.PI * k * this.freq) / sampleRate;
    const c = Math.cos(w);
    const s = Math.sin(w);
    const phase = 2 * Math.PI * this.rng();
    let x = Math.cos(phase);
    let y = Math.sin(phase);
    let amp = envelope(0, 0);

    for (let start = 0; start < length; start += BLOCK) {
      const end = Math.min(length, start + BLOCK);
      const next = envelope(end / sampleRate, start / BLOCK + 1);
      const dAmp = (next - amp) / (end - start);
      for (let i = start; i < end; i++) {
        acc[i] += amp * y;
        const nx = x * c - y * s;
        y = x * s + y * c;
        x = nx;
        amp += dAmp;
      }
      amp = next;
      // Keep the rotation on the unit circle against rounding drift.
      const r = Math.hypot(x, y);
      x /= r;
      y /= r;
    }
  }
}

const REED_HARMONICS = 24;

/**
 * Harmonic amplitudes for the sruti (reed) drone, index 0 being DC. Suitable
 * as the imaginary part of a Web Audio PeriodicWave. Tone 0-100 sets how
 * slowly the harmonics fall off; odd ones are a little stronger, as in a reed.
 */
export function reedSpectrum(tone: number): Float32Array {
  const b = Math.min(100, Math.max(0, tone)) / 100;
  const out = new Float32Array(REED_HARMONICS + 1);
  for (let k = 1; k <= REED_HARMONICS; k++) {
    out[k] = (k % 2 === 1 ? 1 : 0.7) / k ** (1.6 - 0.8 * b);
  }
  return out;
}

/** A small seeded PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
