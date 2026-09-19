import { describe, expect, it } from "vitest";
import { DEFAULT_THAMBURA, type ThamburaMode } from "./shruthi";
import { copyString, copyToAll, FIELD_SPECS, normalizePlan, patternOf, planFor, readField, setGap, writeField } from "./thamburaPlan";
import { EVEN_PATTERN, PLAYED_PATTERN } from "./thamburaSequencer";

const plan = (mode: ThamburaMode, patch = {}) => planFor({ ...DEFAULT_THAMBURA, ...patch, mode });

describe("planFor", () => {
  it("plays the jawari tambura in the recorded rhythm, damped, the second Sa a shade sharp", () => {
    const p = plan("jawari");
    expect(p.gaps).toEqual([...PLAYED_PATTERN.gaps]);
    expect(p.strings.map((s) => s.damp)).toEqual([...PLAYED_PATTERN.damp!]);
    expect(p.strings.map((s) => s.level)).toEqual([0.8, 0.7, 0.7, 1]);
    expect(p.strings.map((s) => s.detune)).toEqual([0, 0, 1.5, 0]);
    expect(patternOf(p)).toEqual({ gaps: PLAYED_PATTERN.gaps, damp: PLAYED_PATTERN.damp });
  });

  it("plays the classic tambura softer, in even slots, ringing on", () => {
    const p = plan("tambura");
    expect(p.strings.map((s) => s.level)).toEqual([0.8 * 0.7, 0.7 * 0.7, 0.7 * 0.7, 0.7]);
    expect(p.strings.map((s) => s.detune)).toEqual([0, 0, 1.5, 0]);
    expect(patternOf(p)).toEqual(EVEN_PATTERN);
  });

  it("plays the guitar in tune, at full level", () => {
    const p = plan("guitar");
    expect(p.strings.map((s) => s.detune)).toEqual([0, 0, 0, 0]);
    expect(p.strings.map((s) => s.level)).toEqual([0.8, 0.7, 0.7, 1]);
  });

  it("plays the custom plan in custom mode, or the jawari's before there is one", () => {
    const custom = { ...plan("guitar"), gaps: [0.4, 0.2, 0.2, 0.2] as [number, number, number, number] };
    expect(planFor({ ...DEFAULT_THAMBURA, mode: "custom" }, custom)).toBe(custom);
    expect(planFor({ ...DEFAULT_THAMBURA, mode: "custom" })).toEqual(plan("jawari"));
  });
});

describe("normalizePlan", () => {
  it.each(["jawari", "tambura", "guitar"] as const)("keeps every %s plan exactly, at any knob setting", (mode) => {
    for (const patch of [{}, { tone: 0, pluck: 0, sustain: 0 }, { tone: 100, pluck: 100, sustain: 100, voice: "ladies" as const }]) {
      const p = plan(mode, patch);
      expect(normalizePlan(p, plan("jawari"))).toEqual(p);
    }
  });

  it("clamps each field to the Lab's range", () => {
    const p = plan("jawari");
    const wild = { ...p, strings: p.strings.map((s) => ({ ...s, level: 100, pan: -9, voice: { ...s.voice, ringSeconds: 500, maxPartials: 3.6 } })) };
    const n = normalizePlan(wild, p);
    expect(n.strings[0].pan).toBe(-1);
    expect(20 * Math.log10(n.strings[0].level)).toBeCloseTo(6, 9);
    expect(n.strings[0].voice.ringSeconds).toBe(60);
    expect(n.strings[0].voice.maxPartials).toBe(4);
  });

  it("falls back for anything missing or malformed, and makes the gaps sum to 1", () => {
    const fb = plan("jawari");
    expect(normalizePlan(null, fb)).toEqual(fb);
    expect(normalizePlan({ strings: "x", gaps: [1, 2] }, fb)).toEqual(fb);
    const p = normalizePlan({ strings: [{ voice: { attack: "soft" } }], gaps: [2, 2, 2, 2] }, fb);
    expect(p.strings[0].voice.attack).toBe(fb.strings[0].voice.attack);
    expect(p.gaps).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});

describe("Lab fields", () => {
  it("reads and writes every field, in display units", () => {
    const s = plan("jawari").strings[0];
    for (const spec of FIELD_SPECS) {
      const mid = (spec.min + spec.max) / 2;
      const raw = spec.fromDisplay ? spec.fromDisplay(mid) : mid;
      const shown = readField(writeField(s, spec.field, raw), spec.field);
      expect(spec.display ? spec.display(shown) : shown).toBeCloseTo(mid, 9);
    }
  });

  it("sets the render length with the ring, up to the tambura cap", () => {
    const s = plan("guitar").strings[0];
    expect(writeField(s, { kind: "voice", key: "ringSeconds" }, 4).voice.seconds).toBe(4);
    expect(writeField(s, { kind: "voice", key: "ringSeconds" }, 30).voice.seconds).toBe(9);
  });

  it("sets one gap and scales the others to keep the round", () => {
    const gaps = setGap([0.3, 0.2, 0.2, 0.3], 0, 0.5);
    expect(gaps[0]).toBe(0.5);
    expect(gaps.reduce((a, b) => a + b)).toBeCloseTo(1, 12);
    expect(gaps[1] / gaps[3]).toBeCloseTo(0.2 / 0.3, 12);
  });
});

describe("copying between strings", () => {
  it("gives one string another's sound, keeping its own place in the mix", () => {
    const p = plan("jawari");
    const c = copyString(p, 3, 1);
    expect(c.strings[1].voice).toEqual(p.strings[3].voice);
    expect(c.strings[1].damp).toBe(p.strings[3].damp);
    expect(c.strings[1]).toMatchObject({ level: p.strings[1].level, pan: p.strings[1].pan, detune: p.strings[1].detune });
    expect([c.strings[0], c.strings[2], c.strings[3]]).toEqual([p.strings[0], p.strings[2], p.strings[3]]);
  });

  it("gives every string one string's sound", () => {
    const p = plan("jawari");
    const c = copyToAll(p, 0);
    for (const [i, s] of c.strings.entries()) {
      expect(s.voice).toEqual(p.strings[0].voice);
      expect(s.level).toBe(p.strings[i].level);
    }
  });
});
