import { isTamburaMode, type ThamburaSettings } from "./shruthi";
import { MAX_TAMBURA_SECONDS, pluckVoice, type PluckVoice } from "./tambura";
import { EVEN_PATTERN, PLAYED_PATTERN, type PluckPattern } from "./thamburaSequencer";

/** How one string sounds and sits in the mix. */
export interface StringPlan {
  /** The rendered pluck (see PluckVoice). */
  voice: PluckVoice;
  /** Linear gain on every pluck. */
  level: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan: number;
  /** Cents added to the fine tune, so a pair of strings can beat. */
  detune: number;
  /** How long before its next pluck the string is stopped, as a share of the round; 0 lets it ring. */
  damp: number;
}

/**
 * Everything that decides how the plucked thambura plays: each string's
 * voice, level, place, detune and damping, and the gap after each pluck as a
 * share of the round. Every plucked mode has one (planFor); the Custom mode
 * plays one the Lab view edits.
 */
export interface ThamburaPlan {
  strings: [StringPlan, StringPlan, StringPlan, StringPlan];
  gaps: [number, number, number, number];
}

// Loudness and stereo place of each string: first, Sa, Sa, low Sa.
const STRING_GAIN = [0.8, 0.7, 0.7, 1];
const STRING_PAN = [-0.25, 0.1, -0.1, 0.25];
// In both tambura modes the second Sa string sits a shade sharp of the first, so the
// pair beats slowly, as two strings tuned by ear do.
const TAMBURA_DETUNE = [0, 0, 1.5, 0];
// Classic tambura plucks ring into each other, so they play a little softer.
// The jawari's are damped before they're plucked again and bloom from a quiet
// attack; at full level they match the classic's loudness (RMS within 0.1 dB).
const TAMBURA_LEVEL = 0.7;

/**
 * The plan the settings play. Custom mode plays `custom` (the jawari
 * tambura's plan if there is none yet); the others are built from the
 * settings. Sruti mode has no plucks and gets the classic tambura's, which
 * keeps its samples warm for a switch back.
 */
export function planFor(s: ThamburaSettings, custom?: ThamburaPlan): ThamburaPlan {
  if (s.mode === "custom") return custom ?? planFor({ ...s, mode: "jawari" });
  const pattern = s.mode === "jawari" ? PLAYED_PATTERN : EVEN_PATTERN;
  const strings = [0, 1, 2, 3].map((i) => ({
    voice: pluckVoice(s, i),
    level: STRING_GAIN[i] * (s.mode === "tambura" ? TAMBURA_LEVEL : 1),
    pan: STRING_PAN[i],
    detune: isTamburaMode(s.mode) ? TAMBURA_DETUNE[i] : 0,
    damp: pattern.damp?.[i] ?? 0,
  }));
  return { strings: strings as ThamburaPlan["strings"], gaps: [...pattern.gaps] as ThamburaPlan["gaps"] };
}

/** The sequencer's pattern for a plan. Strings with damp 0 ring until they're plucked again. */
export function patternOf(plan: ThamburaPlan): PluckPattern {
  const damp = plan.strings.map((s) => s.damp);
  return { gaps: plan.gaps, damp: damp.some((d) => d > 0) ? damp : null };
}

/** Where a Lab control reads and writes. */
export type PlanField = { kind: "string"; key: "level" | "pan" | "detune" | "damp" } | { kind: "voice"; key: keyof PluckVoice };

/** A number the Lab can edit: its range, and how it reads. */
export interface FieldSpec {
  field: PlanField;
  label: string;
  /** One line on what it does, shown as the control's hint. */
  help: string;
  group: "pluck" | "ring" | "tone" | "bloom" | "sweep" | "place";
  min: number;
  max: number;
  step: number;
  /** The value as shown; `fromDisplay` undoes it. */
  display?: (v: number) => number;
  fromDisplay?: (v: number) => number;
  unit: string;
}

const s = (key: "level" | "pan" | "detune" | "damp"): PlanField => ({ kind: "string", key });
const v = (key: keyof PluckVoice): PlanField => ({ kind: "voice", key });
const dB = (x: number) => (x > 0 ? 20 * Math.log10(x) : -60);
const fromDb = (x: number) => 10 ** (x / 20);
const ms = (x: number) => x * 1000;
const fromMs = (x: number) => x / 1000;
const pct = (x: number) => x * 100;
const fromPct = (x: number) => x / 100;

/**
 * Every per-string number the Lab shows, in order. The ranges cover every
 * built-in mode's values, so loading any of them into the Lab loses nothing.
 */
export const FIELD_SPECS: FieldSpec[] = [
  { field: s("level"), label: "Level", help: "How loud the string plays.", group: "pluck", min: -30, max: 6, step: 0.5, display: dB, fromDisplay: fromDb, unit: "dB" },
  { field: v("bite"), label: "Force", help: "Extra high harmonics for the first 40 ms, as from a firm pluck.", group: "pluck", min: 0, max: 3, step: 0.05, unit: "" },
  { field: v("attack"), label: "Attack", help: "How long the pluck takes to rise. Longer is softer, with less click.", group: "pluck", min: 1, max: 80, step: 1, display: ms, fromDisplay: fromMs, unit: "ms" },
  { field: v("pluckAt"), label: "Pluck point", help: "Where along the string it's plucked. Nearer the end is brighter.", group: "pluck", min: 2, max: 50, step: 0.5, display: pct, fromDisplay: fromPct, unit: "%" },
  { field: v("ringSeconds"), label: "Ring", help: "Seconds for the fundamental to fall 60 dB.", group: "ring", min: 0.5, max: 60, step: 0.5, unit: "s" },
  { field: v("damping"), label: "High decay", help: "How much faster each harmonic above the fundamental dies.", group: "ring", min: 0, max: 0.3, step: 0.002, unit: "" },
  { field: s("damp"), label: "Stop before next", help: "Stop the string this long before its next pluck, as a share of the round. 0 lets it ring.", group: "ring", min: 0, max: 40, step: 0.5, display: pct, fromDisplay: fromPct, unit: "%" },
  { field: v("rolloff"), label: "Rolloff", help: "How fast the harmonics fall off at the pluck. Higher is darker.", group: "tone", min: 0.3, max: 3, step: 0.05, unit: "" },
  { field: v("maxPartials"), label: "Harmonics", help: "How many harmonics are rendered (never above 8-10 kHz).", group: "tone", min: 1, max: 64, step: 1, unit: "" },
  { field: v("formantDb"), label: "Bloom", help: "How far the jawari band is boosted at its peak. 0 turns the bloom off.", group: "bloom", min: 0, max: 60, step: 0.5, unit: "dB" },
  { field: v("formantHz"), label: "Bloom centre", help: "The middle of the band the jawari boosts.", group: "bloom", min: 200, max: 5000, step: 10, unit: "Hz" },
  { field: v("formantOctaves"), label: "Bloom width", help: "The band's width on a log-frequency scale.", group: "bloom", min: 0.2, max: 3, step: 0.05, unit: "oct" },
  { field: v("formantRise"), label: "Bloom rise", help: "Time constant of the swell after the pluck.", group: "bloom", min: 0.02, max: 3, step: 0.01, unit: "s" },
  { field: v("formantHold"), label: "Bloom hold", help: "When the bloom starts to fall back.", group: "bloom", min: 0, max: 4, step: 0.05, unit: "s" },
  { field: v("formantFall"), label: "Bloom fall", help: "How fast it falls back.", group: "bloom", min: 0.1, max: 3, step: 0.05, unit: "s" },
  { field: v("formantRest"), label: "Bloom rest", help: "The share of the bloom left after it falls back.", group: "bloom", min: 0, max: 1, step: 0.01, unit: "" },
  { field: v("formantEnergy"), label: "Bloom energy", help: "How much of the boost is new energy. 0 only moves energy up, as a jawari does.", group: "bloom", min: 0, max: 1, step: 0.01, unit: "" },
  { field: v("sweepFrom"), label: "Sweep from", help: "The classic voice's resonance starts at this harmonic…", group: "sweep", min: 1, max: 60, step: 0.5, unit: "" },
  { field: v("sweepTo"), label: "Sweep to", help: "…and sweeps down towards this one.", group: "sweep", min: 1, max: 30, step: 0.5, unit: "" },
  { field: v("sweepSeconds"), label: "Sweep time", help: "Time constant of the sweep.", group: "sweep", min: 0.1, max: 20, step: 0.1, unit: "s" },
  { field: v("sweepWidth"), label: "Sweep width", help: "Width of the resonance, in harmonics.", group: "sweep", min: 0.5, max: 10, step: 0.1, unit: "" },
  { field: v("bloom"), label: "Sweep gain", help: "Extra gain at the resonance's centre. 0 turns the sweep off.", group: "sweep", min: 0, max: 5, step: 0.05, unit: "" },
  { field: v("shimmer"), label: "Shimmer", help: "How far the resonance wanders, in harmonics.", group: "sweep", min: 0, max: 5, step: 0.1, unit: "" },
  { field: v("swell"), label: "Swell", help: "How far below full the upper harmonics start.", group: "sweep", min: 0, max: 1, step: 0.01, unit: "" },
  { field: s("detune"), label: "Detune", help: "Cents off the key, so two strings can beat against each other.", group: "place", min: -20, max: 20, step: 0.1, unit: "¢" },
  { field: s("pan"), label: "Pan", help: "Left (-1) to right (1).", group: "place", min: -1, max: 1, step: 0.05, unit: "" },
];

/** A field's value on one string. */
export function readField(p: StringPlan, f: PlanField): number {
  return f.kind === "string" ? p[f.key] : p.voice[f.key];
}

/**
 * Sets a field on one string. Ring also sets the render length, which stops
 * at MAX_TAMBURA_SECONDS as the built-in tambura voices do.
 */
export function writeField(p: StringPlan, f: PlanField, value: number): StringPlan {
  if (f.kind === "string") return { ...p, [f.key]: value };
  const voice = { ...p.voice, [f.key]: value };
  if (f.key === "ringSeconds") voice.seconds = Math.min(value, MAX_TAMBURA_SECONDS);
  return { ...p, voice };
}

/** One gap is set; the others shrink or grow in proportion, so the round still sums to 1. */
export function setGap(gaps: ThamburaPlan["gaps"], i: number, value: number): ThamburaPlan["gaps"] {
  const v = Math.min(0.85, Math.max(0.05, value));
  const rest = gaps.reduce((a, g, j) => (j === i ? a : a + g), 0);
  return gaps.map((g, j) => (j === i ? v : (g * (1 - v)) / rest)) as ThamburaPlan["gaps"];
}

/**
 * A saved plan made safe to play: every number clamped to its FIELD_SPECS
 * range (voice fields the Lab doesn't show keep `fallback`'s bounds loosely),
 * gaps normalized to sum to 1, and anything missing or malformed taken from
 * `fallback`.
 */
export function normalizePlan(raw: unknown, fallback: ThamburaPlan): ThamburaPlan {
  const r = (raw ?? {}) as Partial<Record<keyof ThamburaPlan, unknown>>;
  const rawStrings = Array.isArray(r.strings) ? r.strings : [];
  const strings = fallback.strings.map((fb, i) => {
    const rs = (rawStrings[i] ?? {}) as Record<string, unknown>;
    const rv = (rs.voice ?? {}) as Record<string, unknown>;
    let plan: StringPlan = { ...fb, voice: { ...fb.voice } };
    for (const key of Object.keys(fb.voice) as (keyof PluckVoice)[]) {
      const x = rv[key];
      if (typeof x === "number" && Number.isFinite(x) && x >= 0) plan.voice[key] = x;
    }
    for (const key of ["level", "pan", "detune", "damp"] as const) {
      const x = rs[key];
      if (typeof x === "number" && Number.isFinite(x)) plan[key] = x;
    }
    for (const spec of FIELD_SPECS) {
      const shown = readField(plan, spec.field);
      const d = spec.display ? spec.display(shown) : shown;
      const clamped = Math.min(spec.max, Math.max(spec.min, d));
      if (clamped !== d) plan = writeField(plan, spec.field, spec.fromDisplay ? spec.fromDisplay(clamped) : clamped);
    }
    plan.voice.maxPartials = Math.round(plan.voice.maxPartials);
    plan.voice.seconds = Math.min(Math.max(0.1, plan.voice.seconds), MAX_TAMBURA_SECONDS);
    return plan;
  });
  const g = Array.isArray(r.gaps) && r.gaps.length === 4 && r.gaps.every((x) => typeof x === "number" && x > 0) ? (r.gaps as number[]) : fallback.gaps;
  const sum = g.reduce((a, b) => a + b, 0);
  return { strings: strings as ThamburaPlan["strings"], gaps: g.map((x) => x / sum) as ThamburaPlan["gaps"] };
}
