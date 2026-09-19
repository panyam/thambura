import type { ThamburaSettings } from "./shruthi";

/**
 * Tambura sound synthesis. Pure: each function returns samples or spectra and
 * the player turns them into Web Audio buffers and oscillators.
 *
 * A pluck is a sum of harmonics. Each one decays at its own rate (the high
 * ones faster), and a resonance sweeps down through the harmonics after the
 * attack. That sweep stands in for the jawari, the curved bridge that makes a
 * real tambura's tone bloom and buzz rather than fade like a guitar's.
 */

/** How one string sounds, derived from the settings by `pluckVoice`. */
export interface PluckVoice {
  /** 0-1: how slowly the harmonics fall off. */
  brightness: number;
  /** 0-1: attack speed and the extra high harmonics at the start. */
  firmness: number;
  /** Seconds for the fundamental to fall 60 dB; also the render length, up to MAX_PLUCK_SECONDS. */
  ringSeconds: number;
  /** 0-1: strength of the jawari sweep. */
  jawari: number;
}

/** Longest pluck rendered. Longer rings are cut with a short fade. */
export const MAX_PLUCK_SECONDS = 6;

const MAX_PARTIALS = 48;
const MAX_PARTIAL_HZ = 10000;
// Envelopes are computed every BLOCK samples and interpolated in between.
const BLOCK = 64;
const PEAK = 0.8;

/**
 * The pluck character for the settings. The gents tambura is the bigger,
 * darker, longer-ringing instrument; ladies' is brighter and a little shorter.
 */
export function pluckVoice(s: Pick<ThamburaSettings, "voice" | "tone" | "pluck" | "sustain">): PluckVoice {
  const ladies = s.voice === "ladies";
  return {
    brightness: Math.min(1, s.tone / 100 + (ladies ? 0.1 : 0)),
    firmness: s.pluck / 100,
    ringSeconds: (2.5 + (5.5 * s.sustain) / 100) * (ladies ? 0.85 : 1),
    jawari: ladies ? 0.7 : 0.85,
  };
}

/**
 * One string's pluck, mono, peaking at 0.8. `seed` sets the harmonics' starting
 * phases, so the same arguments always give the same samples.
 */
export function renderPluck(freq: number, sampleRate: number, voice: PluckVoice, seed = 1): Float32Array {
  const seconds = Math.min(voice.ringSeconds, MAX_PLUCK_SECONDS);
  const length = Math.max(BLOCK, Math.ceil(seconds * sampleRate));
  const acc = new Float64Array(length);
  const rng = mulberry32(seed);

  const limitHz = Math.min(MAX_PARTIAL_HZ, 0.45 * sampleRate);
  const partials = Math.max(1, Math.min(MAX_PARTIALS, Math.floor(limitHz / freq)));

  const b = voice.brightness;
  const f = voice.firmness;
  const rolloff = 1.7 - 0.9 * b;
  // Plucked a little way along the string; an irrational position so no harmonic vanishes.
  const pluckAt = 0.13 - 0.05 * f + 0.001 * Math.SQRT2;
  const tau1 = voice.ringSeconds / Math.log(1000);
  const damping = 0.06 + 0.12 * (1 - b);
  const attack = 0.012 - 0.009 * f;
  const sweepFrom = 12 + 10 * b;
  const sweepTo = 3;
  const sweepTime = 0.25 * voice.ringSeconds;
  const sweepWidth = 2.5;
  const bite = 1.5 * f;

  for (let k = 1; k <= partials; k++) {
    const base = Math.abs(Math.sin(Math.PI * k * pluckAt)) / k ** rolloff;
    const tau = tau1 / (1 + damping * (k - 1));
    const envelope = (t: number) => {
      const centre = sweepTo + (sweepFrom - sweepTo) * Math.exp(-t / sweepTime);
      const bloom = 1 + voice.jawari * 2 * Math.exp(-0.5 * ((k - centre) / sweepWidth) ** 2);
      const edge = k > 4 ? 1 + bite * Math.exp(-t / 0.04) : 1;
      const rise = t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : 1;
      return base * Math.exp(-t / tau) * bloom * edge * rise;
    };

    const w = (2 * Math.PI * k * freq) / sampleRate;
    const c = Math.cos(w);
    const s = Math.sin(w);
    const phase = 2 * Math.PI * rng();
    let x = Math.cos(phase);
    let y = Math.sin(phase);
    let amp = envelope(0);

    for (let start = 0; start < length; start += BLOCK) {
      const end = Math.min(length, start + BLOCK);
      const next = envelope(end / sampleRate);
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

  // Fade the last 50 ms so a cut ring doesn't click.
  const fade = Math.min(length, Math.round(0.05 * sampleRate));
  for (let i = 0; i < fade; i++) acc[length - 1 - i] *= i / fade;

  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(acc[i]));
  const out = new Float32Array(length);
  const scale = peak > 0 ? PEAK / peak : 0;
  for (let i = 0; i < length; i++) out[i] = acc[i] * scale;
  return out;
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
