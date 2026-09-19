import { describe, expect, it } from "vitest";
import {
  DEFAULT_THAMBURA,
  KEYS,
  KEY_C3,
  KEY_G3,
  keyLabel,
  nextRaaginiString,
  normalizeThambura,
  srutiFrequencies,
  THAMBURA_MODES,
  stringFrequencies,
  swaraRatio,
  tonicHz,
  tunedTonicHz,
  type ThamburaSettings,
} from "./shruthi";
import { PluckRender, pluckVoice, renderPluck, reedSpectrum } from "./tambura";
import { ThamburaSequencer, type PluckEvent } from "./thamburaSequencer";

const settings = (patch: Partial<ThamburaSettings> = {}): ThamburaSettings => ({ ...DEFAULT_THAMBURA, ...patch });
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

describe("thambura keys", () => {
  it("runs from A2 to B3 with kattai names", () => {
    expect(KEYS).toHaveLength(15);
    expect(KEYS.map((_, i) => keyLabel(i))).toEqual([
      "A · 6", "A# · 6½", "B · 7", "C · 1", "C# · 1½", "D · 2", "D# · 2½", "E · 3",
      "F · 4", "F# · 4½", "G · 5", "G# · 5½", "A · 6", "A# · 6½", "B · 7",
    ]);
  });

  it("puts men's C3 and women's G3 at the concert pitches", () => {
    expect(tonicHz({ key: 0, a4: 440 })).toBeCloseTo(110, 6);
    expect(tonicHz({ key: KEY_C3, a4: 440 })).toBeCloseTo(130.8128, 3);
    expect(tonicHz({ key: KEY_G3, a4: 440 })).toBeCloseTo(195.9977, 3);
    expect(tonicHz({ key: 12, a4: 440 })).toBeCloseTo(220, 6);
  });

  it("scales every pitch with the A4 reference", () => {
    expect(tonicHz({ key: KEY_C3, a4: 432 }) / tonicHz({ key: KEY_C3, a4: 440 })).toBeCloseTo(432 / 440, 12);
  });

  it("makes +100 cents equal the next key", () => {
    expect(tunedTonicHz({ key: KEY_C3, a4: 440, cents: 100 })).toBeCloseTo(tonicHz({ key: KEY_C3 + 1, a4: 440 }), 9);
    expect(tunedTonicHz({ key: KEY_C3, a4: 440, cents: -50 })).toBeCloseTo(tonicHz({ key: KEY_C3, a4: 440 }) * 2 ** (-50 / 1200), 9);
  });
});

describe("thambura strings", () => {
  it("tunes Pa to 3/2 when just and to 7 semitones when equal", () => {
    expect(swaraRatio("Pa", "just")).toBe(1.5);
    expect(swaraRatio("Pa", "equal")).toBeCloseTo(2 ** (7 / 12), 12);
    expect(swaraRatio("Ma1", "just")).toBeCloseTo(4 / 3, 12);
    expect(swaraRatio("Ni3", "just")).toBeCloseTo(15 / 8, 12);
  });

  it("puts the first string in the lower octave, then Sa, Sa, low Sa", () => {
    const s = settings({ key: KEY_C3, firstString: "Pa" });
    const sa = tonicHz(s);
    expect(stringFrequencies(s)).toEqual([sa * 0.75, sa, sa, sa / 2]);
    expect(stringFrequencies(settings({ firstString: "Sa" }))[0]).toBeCloseTo(sa / 2, 9);
    expect(stringFrequencies(settings({ firstString: "Ni3" }))[0]).toBeCloseTo((sa * 15) / 16, 9);
  });

  it("plays the sruti drone on the first string's swara, Sa and upper Sa", () => {
    const s = settings({ firstString: "Ma1" });
    const sa = tonicHz(s);
    const [low, mid, high] = srutiFrequencies(s);
    expect(low).toBeCloseTo((sa * 2) / 3, 9);
    expect(mid).toBe(sa);
    expect(high).toBe(sa * 2);
  });

  it("steps a Raagini's Select through Pa, Ma, Ni, Sa and back", () => {
    expect(nextRaaginiString("Pa")).toBe("Ma1");
    expect(nextRaaginiString("Ma1")).toBe("Ni3");
    expect(nextRaaginiString("Ni3")).toBe("Sa");
    expect(nextRaaginiString("Sa")).toBe("Pa");
    expect(nextRaaginiString("Ri2")).toBe("Pa");
  });
});

describe("normalizeThambura", () => {
  it("clamps ranges and drops unknown values", () => {
    const s = normalizeThambura({ key: 99, cents: -80, voice: "tenor", firstString: "Xa", a4: 1000, cycleSeconds: 0.5, volume: 120.4 });
    expect(s.key).toBe(14);
    expect(s.cents).toBe(-50);
    expect(s.voice).toBe("gents");
    expect(s.firstString).toBe("Pa");
    expect(s.a4).toBe(480);
    expect(s.cycleSeconds).toBe(2);
    expect(s.volume).toBe(100);
  });

  it("knows the three modes", () => {
    expect(normalizeThambura({ mode: "guitar" }).mode).toBe("guitar");
    expect(normalizeThambura({ mode: "sruti" }).mode).toBe("sruti");
    expect(normalizeThambura({ mode: "banjo" }).mode).toBe("tambura");
  });

  it("lists every mode it accepts, once, with a label", () => {
    expect(THAMBURA_MODES.map((m) => m.id)).toEqual(["tambura", "guitar", "sruti"]);
    for (const m of THAMBURA_MODES) {
      expect(normalizeThambura({ mode: m.id }).mode).toBe(m.id);
      expect(m.label).not.toBe("");
    }
  });

  it("returns the defaults for junk", () => {
    expect(normalizeThambura(null)).toEqual(DEFAULT_THAMBURA);
    expect(normalizeThambura("x")).toEqual(DEFAULT_THAMBURA);
    expect(normalizeThambura({ key: Number.NaN })).toEqual(DEFAULT_THAMBURA);
  });
});

// The period of a signal by autocorrelation with parabolic interpolation.
function detectHz(x: Float32Array, sampleRate: number, from: number, len: number, minHz: number, maxHz: number): number {
  const corr = (lag: number) => {
    let s = 0;
    for (let i = from; i < from + len; i++) s += x[i] * x[i + lag];
    return s;
  };
  const lo = Math.floor(sampleRate / maxHz);
  const hi = Math.ceil(sampleRate / minHz);
  let best = lo;
  let bestVal = -Infinity;
  for (let lag = lo; lag <= hi; lag++) {
    const c = corr(lag);
    if (c > bestVal) {
      bestVal = c;
      best = lag;
    }
  }
  const a = corr(best - 1);
  const b = corr(best);
  const c = corr(best + 1);
  const shift = (0.5 * (a - c)) / (a - 2 * b + c);
  return sampleRate / (best + shift);
}

const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
};

describe("renderPluck", () => {
  const SR = 48000;
  const voice = pluckVoice(DEFAULT_THAMBURA);

  it("stays finite and under full scale", () => {
    const x = renderPluck(130.8128, SR, voice, 1);
    expect(x.every(Number.isFinite)).toBe(true);
    const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it.each([65.4064, 130.8128, 196.1, 246.94])("sounds at %f Hz to within a cent", (hz) => {
    const x = renderPluck(hz, SR, voice, 3);
    const found = detectHz(x, SR, SR, SR / 4, hz * 0.8, hz * 1.25);
    expect(Math.abs(cents(found, hz))).toBeLessThan(1);
  });

  it("decays, and rings longer with more sustain", () => {
    const guitar = { ...DEFAULT_THAMBURA, mode: "guitar" as const };
    const short = renderPluck(130.8128, SR, pluckVoice({ ...guitar, sustain: 0 }), 1);
    const long = renderPluck(130.8128, SR, pluckVoice({ ...guitar, sustain: 100 }), 1);
    expect(rms(long, SR * 2, SR * 2.2)).toBeLessThan(rms(long, SR * 0.1, SR * 0.3));
    const tail = (x: Float32Array) => rms(x, SR * 1.8, SR * 2) / rms(x, SR * 0.1, SR * 0.3);
    expect(tail(long)).toBeGreaterThan(tail(short) * 2);

    const tShort = renderPluck(130.8128, SR, pluckVoice({ ...DEFAULT_THAMBURA, sustain: 0 }), 1);
    const tLong = renderPluck(130.8128, SR, pluckVoice({ ...DEFAULT_THAMBURA, sustain: 100 }), 1);
    const late = (x: Float32Array) => rms(x, SR * 4, SR * 4.2) / rms(x, SR * 0.1, SR * 0.3);
    expect(late(tLong)).toBeGreaterThan(late(tShort) * 2);
  });

  it("is the same for the same seed", () => {
    const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((v, i) => v === b[i]);
    expect(same(renderPluck(110, SR, voice, 7), renderPluck(110, SR, voice, 7))).toBe(true);
    expect(same(renderPluck(110, SR, voice, 7), renderPluck(110, SR, voice, 8))).toBe(false);
  });

  it("gets brighter with tone", () => {
    const dark = pluckVoice({ ...DEFAULT_THAMBURA, tone: 0 });
    const bright = pluckVoice({ ...DEFAULT_THAMBURA, tone: 100 });
    // First differences weigh high partials more, so they measure brightness.
    const edge = (x: Float32Array) => {
      let d = 0;
      for (let i = SR * 0.2; i < SR * 0.4; i++) d += Math.abs(x[i] - x[i - 1]);
      return d / rms(x, SR * 0.2, SR * 0.4);
    };
    expect(edge(renderPluck(130.8, SR, bright, 1))).toBeGreaterThan(edge(renderPluck(130.8, SR, dark, 1)));
  });
});

describe("tambura and guitar plucks", () => {
  const SR = 48000;
  const tambura = pluckVoice({ ...DEFAULT_THAMBURA, mode: "tambura" });
  const guitar = pluckVoice({ ...DEFAULT_THAMBURA, mode: "guitar" });
  // Loudness at `at` seconds relative to just after the attack.
  const level = (x: Float32Array, at: number) => rms(x, SR * at, SR * (at + 0.2)) / rms(x, SR * 0.2, SR * 0.4);
  // Mean first difference over RMS: weighs high harmonics, so it tracks brightness.
  const edge = (x: Float32Array, at: number) => {
    let d = 0;
    for (let i = SR * at; i < SR * (at + 0.2); i++) d += Math.abs(x[i] - x[i - 1]);
    return d / (SR * 0.2) / rms(x, SR * at, SR * (at + 0.2));
  };

  it("renders a tambura long enough to ring into the next round", () => {
    expect(renderPluck(130.81, SR, tambura, 1).length / SR).toBeGreaterThanOrEqual(8.5);
    expect(renderPluck(130.81, SR, guitar, 1).length / SR).toBeLessThanOrEqual(6);
  });

  it("fades a tambura slowly and a guitar quickly", () => {
    const t = renderPluck(130.81, SR, tambura, 1);
    const g = renderPluck(130.81, SR, guitar, 1);
    expect(level(t, 4)).toBeGreaterThan(0.35);
    expect(level(g, 4)).toBeLessThan(0.2);
  });

  it("keeps a tambura's high harmonics ringing while a guitar's dull", () => {
    const t = renderPluck(130.81, SR, tambura, 1);
    const g = renderPluck(130.81, SR, guitar, 1);
    const kept = (x: Float32Array) => edge(x, 3) / edge(x, 0.3);
    expect(kept(t)).toBeGreaterThan(kept(g) * 1.5);
  });

  it.each(["tambura", "guitar"] as const)("sounds in tune as a %s", (mode) => {
    const voice = pluckVoice({ ...DEFAULT_THAMBURA, mode });
    for (const hz of [65.4064, 196.1]) {
      const x = renderPluck(hz, SR, voice, 5);
      const found = detectHz(x, SR, SR * 2, SR / 4, hz * 0.8, hz * 1.25);
      expect(Math.abs(cents(found, hz))).toBeLessThan(1);
    }
  });

  it("renders the same in slices as in one go", () => {
    const whole = renderPluck(98, 16000, tambura, 4);
    const r = new PluckRender(98, 16000, tambura, 4);
    let steps = 0;
    while (!r.step(200_000)) steps++;
    expect(steps).toBeGreaterThan(3);
    const sliced = r.result();
    expect(sliced.length).toBe(whole.length);
    expect(sliced.every((v, i) => v === whole[i])).toBe(true);
  });

  it("reports its work so callers can size the slices", () => {
    const r = new PluckRender(130.81, 16000, tambura, 1);
    expect(r.work).toBe(r.partials * r.length);
    expect(r.partials).toBeGreaterThan(20);
  });
});

describe("reedSpectrum", () => {
  it("starts with the fundamental and falls off, more steeply when dark", () => {
    const dark = reedSpectrum(0);
    const bright = reedSpectrum(100);
    expect(dark[0]).toBe(0); // the DC term
    expect(dark[1]).toBe(1);
    expect(dark[10]).toBeLessThan(dark[2]);
    expect(bright[10]).toBeGreaterThan(dark[10]);
  });
});

describe("ThamburaSequencer", () => {
  const pullAll = (seq: ThamburaSequencer, from: number, to: number, step = 0.025) => {
    const out: PluckEvent[] = [];
    for (let t = from; t < to; t += step) out.push(...seq.pull(t, t + 0.1));
    return out;
  };

  it("plucks first, Sa, Sa, low Sa, then rests a slot", () => {
    const timing = { cycleSeconds: 5 };
    const seq = new ThamburaSequencer(timing, () => 0);
    seq.start(10);
    const ev = pullAll(seq, 10, 19.8);
    expect(ev.map((e) => e.string)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(ev.map((e) => Number(e.time.toFixed(9)))).toEqual([10, 11, 12, 13, 15, 16, 17, 18]);
    expect(ev.every((e) => e.gain === 1)).toBe(true);
  });

  it("hands each pluck out once", () => {
    const seq = new ThamburaSequencer({ cycleSeconds: 2 }, () => 0);
    seq.start(0);
    const ev = pullAll(seq, 0, 4, 0.01);
    expect(ev.map((e) => Number(e.time.toFixed(9)))).toEqual([0, 0.4, 0.8, 1.2, 2, 2.4, 2.8, 3.2, 4]);
  });

  it("applies a speed change from the next pluck not yet handed out", () => {
    const timing = { cycleSeconds: 5 };
    const seq = new ThamburaSequencer(timing, () => 0);
    seq.start(0);
    expect(seq.pull(0, 0.1).map((e) => e.time)).toEqual([0]);
    timing.cycleSeconds = 2.5;
    expect(seq.pull(0.3, 0.45)).toEqual([]);
    expect(seq.pull(0.45, 0.55).map((e) => e.time)).toEqual([0.5]);
  });

  it("varies timing and strength a little from the rng", () => {
    const seq = new ThamburaSequencer({ cycleSeconds: 5 }, () => 0.999);
    seq.start(0);
    const [first, second] = pullAll(seq, 0, 1.2);
    expect(first.time).toBeGreaterThan(0);
    expect(first.time).toBeLessThan(0.03);
    expect(second.time - 1).toBeLessThan(0.03);
    expect(first.gain).toBeGreaterThan(0.8);
    expect(first.gain).toBeLessThan(1);
  });

  it("stops and restarts from the first string", () => {
    const seq = new ThamburaSequencer({ cycleSeconds: 5 }, () => 0);
    seq.start(0);
    pullAll(seq, 0, 1.5);
    seq.stop(1.5);
    expect(seq.pull(1.5, 5)).toEqual([]);
    seq.start(3);
    expect(seq.pull(3, 3.1)).toEqual([{ time: 3, string: 0, gain: 1 }]);
  });
});
