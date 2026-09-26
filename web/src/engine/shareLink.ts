import { DEFAULT_THAMBURA, normalizeThambura, type ThamburaSettings } from "./shruthi";
import { ATTACK_LEVEL, type PluckVoice } from "./tambura";
import { FIELD_SPECS, planFor, readField, writeField, type FieldSpec, type PlanField, type ThamburaPlan } from "./thamburaPlan";

/**
 * Shareable links: the thambura's setup packed into one short URL-safe
 * string (the `s` query parameter), so a link plays what its sender heard.
 *
 * Format 1, bytes, then base64url without padding:
 *
 *   0      format (1)
 *   1      flags: bit 0 equal temperament, bit 1 ladies, bit 2 bar open, bits 3-5 view
 *   2-5    mode, key, cents + 64, first string
 *   6-7    A4 in tenths of a Hz; 8-9 the round in hundredths of a second
 *   10-12  tone, pluck, sustain
 *   Custom mode only, stored against the built-in plan it's closest to:
 *   13     that plan (see BASES), plus 0x80 for the "whole" layout
 *   14-15  that plan's checksum, to notice when a built-in sound has changed
 *   edits: a count, then each edit: a field (plus 0x40 when the value is
 *          exact), a mask of the strings it applies to, and the value
 *   whole: every string's fields in FIELDS order, each 0 for "as the
 *          starting plan", 1 and an exact value, or its value + 2; a mask of
 *          the strings scaled by their attack; the four gaps
 *   then:  voice values the Lab doesn't show (HIDDEN) wherever they differ
 *          from what the above gives: a count, then each a key, a mask of
 *          strings and an exact value
 *   Gaps are stored in ten-thousandths of the round. Whichever layout is
 *   shorter is used, so a link is never longer than the whole layout.
 *
 * Plan values are stored in the Lab's display units, as steps of the field's
 * slider above its minimum, so anything set in the Lab is a byte or two. A
 * value off the slider's steps (a built-in sound's, or one copied to other
 * strings) is stored exactly, as a 64-bit float.
 * Volume is left out: it depends on the listener's room. The orders below are
 * part of the format; add to their ends, never reorder.
 */
const FORMAT = 1;
const MODES = ["jawari", "tambura", "guitar", "custom", "sruti"] as const;
const VIEWS = ["mini", "studio", "raagini", "lab"] as const;
const SWARAS = ["Sa", "Ri1", "Ri2", "Ri3", "Ga3", "Ma1", "Ma2", "Pa", "Da1", "Da2", "Da3", "Ni3"] as const;
// The built-in plans a Custom plan is stored against.
const BASES = ["jawari", "tambura", "guitar"] as const;
const WHOLE = 0x80;
// Where the bar's open flag sits: the flags byte, bit 2.
const FLAGS_AT = 1;
const OPEN_FLAG = 4;
const FIELDS: PlanField["key"][] = [
  "level", "bite", "attack", "pluckAt", "ringSeconds", "damping", "damp", "rolloff", "maxPartials",
  "formantDb", "formantHz", "formantOctaves", "formantRise", "formantHold", "formantFall", "formantRest",
  "formantEnergy", "sweepFrom", "sweepTo", "sweepSeconds", "sweepWidth", "bloom", "shimmer", "swell",
  "detune", "pan",
];
// Edits that aren't one of FIELDS.
const EDIT_SCALE = 254; // mask of strings scaled by their attack
const EDIT_GAPS = 255; // the four gaps
const EXACT = 0x40;
const HIDDEN: (keyof PluckVoice)[] = ["seconds", "tailFade", "maxPartialHz", "attackLevel"];
const SPECS = FIELDS.map((key) => FIELD_SPECS.find((s) => s.field.key === key)!);

/** What a link carries. */
export interface SharedSetup {
  settings: ThamburaSettings;
  custom: ThamburaPlan;
  view: (typeof VIEWS)[number];
  /** Whether the thambura's bar is showing. The page's layout owns it, not the sound. */
  open?: boolean;
}

/** A decoded link, and anything the listener should know about it. */
export interface DecodedLink {
  settings: ThamburaSettings;
  /** The plan, for a Custom link; otherwise the listener keeps their own. */
  custom: ThamburaPlan | null;
  view: SharedSetup["view"];
  open: boolean;
  /** Set when a Custom link's starting sound has changed since the link was made. */
  drifted: boolean;
}

export function encodeLink(x: SharedSetup): string {
  const s = x.settings;
  const w = new Writer();
  w.byte(FORMAT);
  const view = Math.max(0, VIEWS.indexOf(x.view));
  w.byte((s.temperament === "equal" ? 1 : 0) | (s.voice === "ladies" ? 2 : 0) | (x.open ? OPEN_FLAG : 0) | (view << 3));
  w.byte(MODES.indexOf(s.mode));
  w.byte(s.key);
  w.byte(s.cents + 64);
  w.byte(SWARAS.indexOf(s.firstString as (typeof SWARAS)[number]));
  w.u16(Math.round(s.a4 * 10));
  w.u16(Math.round(s.cycleSeconds * 100));
  w.byte(s.tone);
  w.byte(s.pluck);
  w.byte(s.sustain);
  if (s.mode === "custom") {
    // Store whichever is shortest: against each built-in plan, as edits or whole.
    const options = BASES.flatMap((base, i) => {
      const start = planFor({ ...s, mode: base });
      return [false, true].map((whole) => {
        const out = new Writer();
        out.byte(i | (whole ? WHOLE : 0));
        out.u16(checksum(start));
        if (whole) writeWhole(out, x.custom, start);
        else writeEdits(out, x.custom, start);
        writeHidden(out, x.custom, rebuild(x.custom, start));
        return out.bytes();
      });
    });
    w.raw(options.reduce((a, b) => (b.length < a.length ? b : a)));
  }
  return base64url(w.bytes());
}

/**
 * The setup a link carries, clamped to valid values, or null if it isn't a
 * link this app can read. `current` fills in anything the link leaves out
 * (volume, and the Custom plan when the link isn't a Custom one).
 */
export function decodeLink(link: string, current: { settings: ThamburaSettings }): DecodedLink | null {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64url(link);
  } catch {
    return null;
  }
  const r = new Reader(bytes);
  try {
    if (r.byte() !== FORMAT) return null;
    const flags = r.byte();
    const mode = MODES[r.byte()];
    const settings = normalizeThambura(
      {
        temperament: flags & 1 ? "equal" : "just",
        voice: flags & 2 ? "ladies" : "gents",
        mode,
        key: r.byte(),
        cents: r.byte() - 64,
        firstString: SWARAS[r.byte()],
        a4: r.u16() / 10,
        cycleSeconds: r.u16() / 100,
        tone: r.byte(),
        pluck: r.byte(),
        sustain: r.byte(),
        volume: current.settings.volume,
      },
      current.settings,
    );
    const view = VIEWS[(flags >> 3) & 7] ?? "studio";
    let custom: ThamburaPlan | null = null;
    let drifted = false;
    if (mode === "custom") {
      const layout = r.byte();
      const base = BASES[layout & ~WHOLE];
      if (base === undefined) return null;
      const start = planFor({ ...settings, mode: base });
      drifted = r.u16() !== checksum(start);
      custom = readHidden(r, layout & WHOLE ? readWhole(r, start) : readEdits(r, start));
    }
    if (!r.done) return null;
    return { settings, custom, view, open: (flags & OPEN_FLAG) !== 0, drifted };
  } catch {
    return null;
  }
}

// ---- plan values as slider steps ---------------------------------------------

function toStep(spec: FieldSpec, raw: number): number {
  const shown = spec.display ? spec.display(raw) : raw;
  const clamped = Math.min(spec.max, Math.max(spec.min, shown));
  return Math.round((clamped - spec.min) / spec.step);
}

function fromStep(spec: FieldSpec, q: number): number {
  const shown = Math.min(spec.max, spec.min + q * spec.step);
  return spec.fromDisplay ? spec.fromDisplay(shown) : shown;
}

/** A value as a slider step when it sits on one, else null. */
function onStep(spec: FieldSpec, raw: number): number | null {
  const q = toStep(spec, raw);
  return Math.abs(fromStep(spec, q) - raw) <= 1e-12 * Math.max(1, Math.abs(raw)) ? q : null;
}

function scaleMask(p: ThamburaPlan): number {
  return p.strings.reduce((m, s, i) => (s.voice.attackLevel > 0 ? m | (1 << i) : m), 0);
}

function gapSteps(p: ThamburaPlan): number[] {
  return p.gaps.map((g) => Math.round(g * 10000));
}

function checksum(p: ThamburaPlan): number {
  // FNV-1a over the plan's slider steps, folded to 16 bits.
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n & 0xffff;
    h = Math.imul(h, 0x01000193);
  };
  for (const s of p.strings) for (const spec of SPECS) mix(toStep(spec, readField(s, spec.field)));
  mix(scaleMask(p));
  gapSteps(p).forEach(mix);
  return (h ^ (h >>> 16)) & 0xffff;
}

function writeEdits(w: Writer, plan: ThamburaPlan, start: ThamburaPlan): void {
  const edits: [number, number, number][] = [];
  SPECS.forEach((spec, f) => {
    // Strings that share a new value become one edit.
    const byValue = new Map<number, number>();
    plan.strings.forEach((s, i) => {
      const v = readField(s, spec.field);
      if (v !== readField(start.strings[i], spec.field)) byValue.set(v, (byValue.get(v) ?? 0) | (1 << i));
    });
    for (const [v, mask] of byValue) edits.push([f, mask, v]);
  });
  const scale = scaleMask(plan);
  if (scale !== scaleMask(start)) edits.push([EDIT_SCALE, scale, 0]);
  const gaps = gapSteps(plan);
  if (gaps.join() !== gapSteps(start).join()) edits.push([EDIT_GAPS, 0, 0]);
  w.varint(edits.length);
  for (const [f, mask, v] of edits) {
    if (f === EDIT_GAPS) {
      w.byte(f);
      gaps.forEach((g) => w.u16(g));
    } else if (f === EDIT_SCALE) {
      w.byte(f);
      w.byte(mask);
    } else {
      const q = onStep(SPECS[f], v);
      w.byte(q === null ? f | EXACT : f);
      w.byte(mask);
      if (q === null) w.f64(v);
      else w.varint(q);
    }
  }
}

function readEdits(r: Reader, start: ThamburaPlan): ThamburaPlan {
  const strings = [...start.strings] as ThamburaPlan["strings"];
  let gaps = start.gaps;
  for (let n = r.varint(); n > 0; n--) {
    const f = r.byte();
    if (f === EDIT_GAPS) {
      gaps = normalizeGaps([r.u16(), r.u16(), r.u16(), r.u16()]);
      continue;
    }
    const mask = r.byte();
    if (f === EDIT_SCALE) {
      strings.forEach((s, i) => {
        strings[i] = { ...s, voice: { ...s.voice, attackLevel: mask & (1 << i) ? ATTACK_LEVEL : 0 } };
      });
      continue;
    }
    const spec = SPECS[f & ~EXACT];
    if (!spec || !(mask > 0 && mask < 16)) throw new Error("unknown field");
    const value = f & EXACT ? r.f64() : fromStep(spec, r.varint());
    strings.forEach((s, i) => {
      if (mask & (1 << i)) strings[i] = writeField(s, spec.field, value);
    });
  }
  return { strings, gaps };
}

/** What either layout gives back for `plan`, before the hidden values. */
function rebuild(plan: ThamburaPlan, start: ThamburaPlan): ThamburaPlan {
  const scale = scaleMask(plan);
  const strings = start.strings.map((s, i) => {
    let out = s;
    for (const spec of SPECS) {
      const v = readField(plan.strings[i], spec.field);
      if (v !== readField(s, spec.field)) out = writeField(out, spec.field, v);
    }
    if (scale !== scaleMask(start)) out = { ...out, voice: { ...out.voice, attackLevel: scale & (1 << i) ? ATTACK_LEVEL : 0 } };
    return out;
  }) as ThamburaPlan["strings"];
  return { strings, gaps: plan.gaps };
}

function writeHidden(w: Writer, plan: ThamburaPlan, rebuilt: ThamburaPlan): void {
  const edits: [number, number, number][] = [];
  HIDDEN.forEach((key, k) => {
    const byValue = new Map<number, number>();
    plan.strings.forEach((s, i) => {
      if (s.voice[key] !== rebuilt.strings[i].voice[key]) byValue.set(s.voice[key], (byValue.get(s.voice[key]) ?? 0) | (1 << i));
    });
    for (const [v, mask] of byValue) edits.push([k, mask, v]);
  });
  w.varint(edits.length);
  for (const [k, mask, v] of edits) {
    w.byte(k);
    w.byte(mask);
    w.f64(v);
  }
}

function readHidden(r: Reader, plan: ThamburaPlan): ThamburaPlan {
  const strings = [...plan.strings] as ThamburaPlan["strings"];
  for (let n = r.varint(); n > 0; n--) {
    const key = HIDDEN[r.byte()];
    const mask = r.byte();
    const v = r.f64();
    if (!key || !(mask > 0 && mask < 16) || v < 0) throw new Error("bad hidden value");
    strings.forEach((s, i) => {
      if (mask & (1 << i)) strings[i] = { ...s, voice: { ...s.voice, [key]: v } };
    });
  }
  return { ...plan, strings };
}

function writeWhole(w: Writer, plan: ThamburaPlan, start: ThamburaPlan): void {
  plan.strings.forEach((s, i) => {
    for (const spec of SPECS) {
      const v = readField(s, spec.field);
      const q = onStep(spec, v);
      if (v === readField(start.strings[i], spec.field)) w.varint(0);
      else if (q === null) {
        w.varint(1);
        w.f64(v);
      } else w.varint(q + 2);
    }
  });
  w.byte(scaleMask(plan));
  gapSteps(plan).forEach((g) => w.u16(g));
}

function readWhole(r: Reader, start: ThamburaPlan): ThamburaPlan {
  const strings = start.strings.map((s) => {
    let out = s;
    for (const spec of SPECS) {
      const v = r.varint();
      if (v === 1) out = writeField(out, spec.field, r.f64());
      else if (v > 1) out = writeField(out, spec.field, fromStep(spec, v - 2));
    }
    return out;
  }) as ThamburaPlan["strings"];
  const scale = r.byte();
  strings.forEach((s, i) => {
    strings[i] = { ...s, voice: { ...s.voice, attackLevel: scale & (1 << i) ? ATTACK_LEVEL : 0 } };
  });
  return { strings, gaps: normalizeGaps([r.u16(), r.u16(), r.u16(), r.u16()]) };
}

function normalizeGaps(steps: number[]): ThamburaPlan["gaps"] {
  const g = steps.map((x) => Math.max(1, x));
  const sum = g.reduce((a, b) => a + b, 0);
  return g.map((x) => x / sum) as ThamburaPlan["gaps"];
}

// ---- bytes ---------------------------------------------------------------------

class Writer {
  private out: number[] = [];
  byte(n: number): void {
    this.out.push(Math.max(0, Math.min(255, Math.round(n))));
  }
  u16(n: number): void {
    const v = Math.max(0, Math.min(0xffff, Math.round(n)));
    this.out.push(v >> 8, v & 0xff);
  }
  /** 7 bits a byte, low first; 0-127 takes one byte. */
  varint(n: number): void {
    let v = Math.max(0, Math.round(n));
    while (v > 0x7f) {
      this.out.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.out.push(v);
  }
  f64(n: number): void {
    const b = new DataView(new ArrayBuffer(8));
    b.setFloat64(0, n);
    for (let i = 0; i < 8; i++) this.out.push(b.getUint8(i));
  }
  raw(bytes: Uint8Array): void {
    this.out.push(...bytes);
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

class Reader {
  private i = 0;
  constructor(private readonly b: Uint8Array) {}
  get done(): boolean {
    return this.i === this.b.length;
  }
  byte(): number {
    if (this.i >= this.b.length) throw new Error("short link");
    return this.b[this.i++];
  }
  u16(): number {
    return (this.byte() << 8) | this.byte();
  }
  f64(): number {
    const b = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < 8; i++) b.setUint8(i, this.byte());
    const v = b.getFloat64(0);
    if (!Number.isFinite(v)) throw new Error("bad number");
    return v;
  }
  varint(): number {
    let v = 0;
    for (let shift = 0; shift < 28; shift += 7) {
      const b = this.byte();
      v |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return v;
    }
    throw new Error("bad varint");
  }
}

/**
 * Whether a link says the bar is open, or null if it isn't a link this app can
 * read. The layout that shows the bar reads this; the presenter never does.
 */
export function barOpen(link: string): boolean | null {
  return decodeLink(link, { settings: DEFAULT_THAMBURA })?.open ?? null;
}

/**
 * The same link with the bar's flag set to `open` and every other byte kept,
 * so a Custom plan isn't re-encoded. A link this app can't read comes back as
 * it was.
 */
export function withBarOpen(link: string, open: boolean): string {
  if (barOpen(link) === null) return link;
  const bytes = fromBase64url(link);
  bytes[FLAGS_AT] = open ? bytes[FLAGS_AT] | OPEN_FLAG : bytes[FLAGS_AT] & ~OPEN_FLAG;
  return base64url(bytes);
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("not base64url");
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
