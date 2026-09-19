/**
 * Thambura pitch maths and settings. Pure: no audio, DOM or timers.
 *
 * The tonic (Sa) is picked from 15 keys, A2 up to B3, the range of a Raagini
 * electronic tambura. Each key carries its kattai name (C is 1, A is 6, a sharp
 * is "half"), so C3 is a common men's Sa and G3 (5 kattai) a common women's.
 * Gents/ladies picks the tambura's timbre, not its octave.
 *
 * The four strings are the first string (in the lower octave), two Sa strings
 * at the tonic, and a low Sa an octave down.
 */

export type Swara = "Sa" | "Ri1" | "Ri2" | "Ri3" | "Ga3" | "Ma1" | "Ma2" | "Pa" | "Da1" | "Da2" | "Da3" | "Ni3";
export type Voice = "gents" | "ladies";
export type Temperament = "just" | "equal";
/**
 * How the thambura sounds: a plucked tambura that rings on from round to
 * round, a shorter guitar-like pluck, or the sruti box's steady reed tones.
 */
export type ThamburaMode = "tambura" | "guitar" | "sruti";

export interface SwaraInfo {
  id: Swara;
  /** Both names where two swaras share a position, e.g. "Ri2 / Ga1". */
  label: string;
  semitones: number;
  /** Just-intonation ratio to Sa. */
  ratio: number;
}

export const SWARAS: SwaraInfo[] = [
  { id: "Sa", label: "Sa", semitones: 0, ratio: 1 },
  { id: "Ri1", label: "Ri1", semitones: 1, ratio: 16 / 15 },
  { id: "Ri2", label: "Ri2 / Ga1", semitones: 2, ratio: 9 / 8 },
  { id: "Ri3", label: "Ri3 / Ga2", semitones: 3, ratio: 6 / 5 },
  { id: "Ga3", label: "Ga3", semitones: 4, ratio: 5 / 4 },
  { id: "Ma1", label: "Ma1", semitones: 5, ratio: 4 / 3 },
  { id: "Ma2", label: "Ma2", semitones: 6, ratio: 45 / 32 },
  { id: "Pa", label: "Pa", semitones: 7, ratio: 3 / 2 },
  { id: "Da1", label: "Da1", semitones: 8, ratio: 8 / 5 },
  { id: "Da2", label: "Da2 / Ni1", semitones: 9, ratio: 5 / 3 },
  { id: "Da3", label: "Da3 / Ni2", semitones: 10, ratio: 16 / 9 },
  { id: "Ni3", label: "Ni3", semitones: 11, ratio: 15 / 8 },
];

/** The first strings a Raagini's Select button steps through, in order. */
export const RAAGINI_CYCLE: Swara[] = ["Pa", "Ma1", "Ni3", "Sa"];

export interface KeyInfo {
  note: string;
  /** "1" for C up to "7" for B; a sharp is "½" more, e.g. "4½" for F#. */
  kattai: string;
  octave: number;
}

const NOTES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
const KATTAI = ["6", "6½", "7", "1", "1½", "2", "2½", "3", "4", "4½", "5", "5½"];

/** Keys 0..14: A2 up to B3. */
export const KEYS: KeyInfo[] = Array.from({ length: 15 }, (_, i) => ({
  note: NOTES[i % 12],
  kattai: KATTAI[i % 12],
  octave: i < 3 ? 2 : 3,
}));

// A2 is MIDI note 45.
const MIDI_OF_KEY0 = 45;

export const KEY_C3 = 3;
export const KEY_G3 = 10;

export interface ThamburaSettings {
  /** Index into KEYS. */
  key: number;
  /** Fine tune, -50..50 cents. */
  cents: number;
  voice: Voice;
  firstString: Swara;
  temperament: Temperament;
  /** Reference pitch for A4, in Hz. */
  a4: number;
  mode: ThamburaMode;
  /** Seconds for one round of four plucks plus the rest after them. */
  cycleSeconds: number;
  /** 0-100, for the drone bus. */
  volume: number;
  /** 0-100: dark to bright. */
  tone: number;
  /** 0-100: soft to firm. */
  pluck: number;
  /** 0-100: short to long ring. */
  sustain: number;
}

export const DEFAULT_THAMBURA: ThamburaSettings = {
  key: KEY_C3,
  cents: 0,
  voice: "gents",
  firstString: "Pa",
  temperament: "just",
  a4: 440,
  mode: "tambura",
  cycleSeconds: 4.5,
  volume: 60,
  tone: 50,
  pluck: 50,
  sustain: 60,
};

export const MAX_CENTS = 50;
export const MIN_CYCLE = 2;
export const MAX_CYCLE = 8;
export const MIN_A4 = 400;
export const MAX_A4 = 480;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function num(v: unknown, fallback: number, lo: number, hi: number, round = false): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return clamp(round ? Math.round(n) : n, lo, hi);
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

/**
 * Settings from anything (saved JSON, a partial patch), with every field
 * clamped to its range and unknown values replaced by the default's.
 */
export function normalizeThambura(raw: unknown, base: ThamburaSettings = DEFAULT_THAMBURA): ThamburaSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    key: num(r.key, base.key, 0, KEYS.length - 1, true),
    cents: num(r.cents, base.cents, -MAX_CENTS, MAX_CENTS, true),
    voice: oneOf(r.voice, ["gents", "ladies"], base.voice),
    firstString: oneOf(
      r.firstString,
      SWARAS.map((s) => s.id),
      base.firstString,
    ),
    temperament: oneOf(r.temperament, ["just", "equal"], base.temperament),
    a4: num(r.a4, base.a4, MIN_A4, MAX_A4),
    mode: oneOf(r.mode, ["tambura", "guitar", "sruti"], base.mode),
    cycleSeconds: num(r.cycleSeconds, base.cycleSeconds, MIN_CYCLE, MAX_CYCLE),
    volume: num(r.volume, base.volume, 0, 100, true),
    tone: num(r.tone, base.tone, 0, 100, true),
    pluck: num(r.pluck, base.pluck, 0, 100, true),
    sustain: num(r.sustain, base.sustain, 0, 100, true),
  };
}

export function swaraInfo(id: Swara): SwaraInfo {
  return SWARAS.find((s) => s.id === id) ?? SWARAS[0];
}

/** "C · 1", "F# · 4½". */
export function keyLabel(key: number): string {
  const k = KEYS[clamp(key, 0, KEYS.length - 1)];
  return `${k.note} · ${k.kattai}`;
}

/** Sa in Hz for the key and A4 reference, before fine tuning. */
export function tonicHz(s: Pick<ThamburaSettings, "key" | "a4">): number {
  return s.a4 * 2 ** ((MIDI_OF_KEY0 + s.key - 69) / 12);
}

/** Sa in Hz including the fine tune. */
export function tunedTonicHz(s: Pick<ThamburaSettings, "key" | "a4" | "cents">): number {
  return tonicHz(s) * 2 ** (s.cents / 1200);
}

/** A swara's ratio to Sa under the temperament. */
export function swaraRatio(id: Swara, temperament: Temperament): number {
  const info = swaraInfo(id);
  return temperament === "just" ? info.ratio : 2 ** (info.semitones / 12);
}

/**
 * The four strings' frequencies (without fine tune, which the player applies
 * as detune): the first string in the lower octave, Sa, Sa, and low Sa.
 */
export function stringFrequencies(s: ThamburaSettings): [number, number, number, number] {
  const sa = tonicHz(s);
  return [(sa * swaraRatio(s.firstString, s.temperament)) / 2, sa, sa, sa / 2];
}

/**
 * The sruti (reed) drone's pitches: the first string's swara below Sa, Sa,
 * and upper Sa. With Sa as the first string that is low Sa, Sa, upper Sa.
 */
export function srutiFrequencies(s: ThamburaSettings): [number, number, number] {
  const sa = tonicHz(s);
  return [(sa * swaraRatio(s.firstString, s.temperament)) / 2, sa, sa * 2];
}

/**
 * The next first string for a Raagini's Select button. From a swara outside
 * the cycle it starts over at Pa.
 */
export function nextRaaginiString(current: Swara): Swara {
  const i = RAAGINI_CYCLE.indexOf(current);
  return RAAGINI_CYCLE[(i + 1) % RAAGINI_CYCLE.length];
}

/** The short name for a string: its swara for the first, else Sa. */
export function stringLabels(s: ThamburaSettings): [string, string, string, string] {
  return [s.firstString, "Sa", "Sa", "Sa"];
}
