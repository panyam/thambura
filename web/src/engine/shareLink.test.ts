import { describe, expect, it } from "vitest";
import { mulberry32 } from "./tambura";
import { BUILT_IN_PRESETS } from "./presets";
import { decodeLink, encodeLink, type SharedSetup } from "./shareLink";
import { DEFAULT_THAMBURA, KEYS, SWARAS, type ThamburaSettings } from "./shruthi";
import { FIELD_SPECS, planFor, readField, setGap, writeField, type ThamburaPlan } from "./thamburaPlan";

const current = { settings: { ...DEFAULT_THAMBURA, volume: 37 } };
const jawari = planFor({ ...DEFAULT_THAMBURA, mode: "jawari" });
const setup = (settings: Partial<ThamburaSettings> = {}, custom = jawari, rest: Partial<SharedSetup> = {}): SharedSetup => ({
  settings: { ...DEFAULT_THAMBURA, ...settings },
  custom,
  view: "studio",
  open: false,
  ...rest,
});

/** Every number in a plan's strings, for comparing two plans within a tolerance. */
function numbers(p: ThamburaPlan): number[] {
  return p.strings.flatMap((s) => [s.level, s.pan, s.detune, s.damp, ...Object.values(s.voice)]);
}
function expectSamePlan(a: ThamburaPlan, b: ThamburaPlan) {
  const x = numbers(a);
  const y = numbers(b);
  expect(x.length).toBe(y.length);
  x.forEach((v, i) => expect(v).toBeCloseTo(y[i], 9));
  // Gaps travel in ten-thousandths of the round.
  a.gaps.forEach((g, i) => expect(Math.abs(g - b.gaps[i])).toBeLessThan(1e-4));
}

/** A plan as the Lab would leave it: values on the sliders' steps, gaps moved one at a time. */
function labEdits(rng: () => number, from: ThamburaPlan, edits: number): ThamburaPlan {
  let p = from;
  for (let n = 0; n < edits; n++) {
    const spec = FIELD_SPECS[Math.floor(rng() * FIELD_SPECS.length)];
    const steps = Math.round((spec.max - spec.min) / spec.step);
    const shown = spec.min + Math.floor(rng() * (steps + 1)) * spec.step;
    const value = spec.fromDisplay ? spec.fromDisplay(shown) : shown;
    const which = rng() < 0.3 ? [0, 1, 2, 3] : [Math.floor(rng() * 4)];
    const strings = [...p.strings] as ThamburaPlan["strings"];
    for (const i of which) strings[i] = writeField(strings[i], spec.field, value);
    p = { ...p, strings };
    if (rng() < 0.2) p = { ...p, gaps: setGap(p.gaps, Math.floor(rng() * 4), 0.1 + rng() * 0.3) };
  }
  return p;
}

describe("share links", () => {
  it("carries every setting but the volume", () => {
    const rng = mulberry32(3);
    for (let n = 0; n < 200; n++) {
      const settings: ThamburaSettings = {
        key: Math.floor(rng() * KEYS.length),
        cents: Math.floor(rng() * 101) - 50,
        voice: rng() < 0.5 ? "gents" : "ladies",
        firstString: SWARAS[Math.floor(rng() * SWARAS.length)].id,
        temperament: rng() < 0.5 ? "just" : "equal",
        a4: Math.round(4000 + rng() * 800) / 10,
        mode: (["jawari", "tambura", "guitar", "sruti"] as const)[Math.floor(rng() * 4)],
        cycleSeconds: Math.round(200 + rng() * 600) / 100,
        volume: 99,
        tone: Math.floor(rng() * 101),
        pluck: Math.floor(rng() * 101),
        sustain: Math.floor(rng() * 101),
      };
      const view = (["mini", "studio", "raagini", "lab"] as const)[n % 4];
      const d = decodeLink(encodeLink(setup(settings, jawari, { view, open: n % 2 === 0 })), current)!;
      expect(d.settings).toEqual({ ...settings, volume: 37 });
      expect(d.view).toBe(view);
      expect(d.open).toBe(n % 2 === 0);
      expect(d.custom).toBeNull();
    }
  });

  it("keeps a plain setup to about 20 characters", () => {
    expect(encodeLink(setup()).length).toBeLessThanOrEqual(20);
  });

  it.each(["jawari", "tambura", "guitar"] as const)("stores an untouched %s plan as a few bytes, exactly", (mode) => {
    const plan = planFor({ ...DEFAULT_THAMBURA, tone: 70, mode });
    const link = encodeLink(setup({ mode: "custom", tone: 70 }, plan));
    expect(link.length).toBeLessThanOrEqual(26);
    expect(decodeLink(link, current)!.custom).toEqual(plan);
  });

  it("stores a few Lab edits in about 30 characters", () => {
    const attack = FIELD_SPECS.find((s) => s.field.key === "attack")!;
    const level = FIELD_SPECS.find((s) => s.field.key === "level")!;
    let strings = jawari.strings.map((s) => writeField(s, attack.field, 0.025)) as ThamburaPlan["strings"];
    strings = strings.map((s, i) => (i === 2 ? writeField(s, level.field, 1) : s)) as ThamburaPlan["strings"];
    const plan = { ...jawari, strings };
    const link = encodeLink(setup({ mode: "custom" }, plan));
    expect(link.length).toBeLessThanOrEqual(32);
    expectSamePlan(decodeLink(link, current)!.custom!, plan);
  });

  it("brings back any plan made in the Lab, by edits or whole", () => {
    const rng = mulberry32(11);
    const lengths: number[] = [];
    for (let n = 0; n < 60; n++) {
      const from = planFor({ ...DEFAULT_THAMBURA, mode: (["jawari", "tambura", "guitar"] as const)[n % 3] });
      const plan = labEdits(rng, from, n < 30 ? 1 + Math.floor(rng() * 6) : 80);
      const link = encodeLink(setup({ mode: "custom" }, plan));
      lengths.push(link.length);
      const d = decodeLink(link, current)!;
      expect(d.drifted).toBe(false);
      expectSamePlan(d.custom!, plan);
    }
    // A plan edited everywhere falls back to the whole plan, which bounds the length.
    expect(Math.max(...lengths)).toBeLessThanOrEqual(300);
  });

  it("brings back values off the sliders' steps exactly, hidden ones too", () => {
    // A classic plan (ring 26.4 s) with the low Sa copied to every string, stored against the jawari.
    const classic = planFor({ ...DEFAULT_THAMBURA, mode: "tambura" });
    const low = classic.strings[3];
    const plan = { ...classic, strings: classic.strings.map((s) => ({ ...low, level: s.level, pan: s.pan })) as ThamburaPlan["strings"] };
    const d = decodeLink(encodeLink(setup({ mode: "custom" }, plan)), current)!;
    expect(d.custom!.strings).toEqual(plan.strings);
  });

  it.each(FIELD_SPECS.map((spec) => [spec.label, spec] as const))("carries a change to %s alone", (_, spec) => {
    // A field added to the Lab but not to the link format would come back unchanged.
    const start = jawari.strings[1];
    const shown = spec.display ? spec.display(readField(start, spec.field)) : readField(start, spec.field);
    const target = shown + spec.step <= spec.max ? spec.max : spec.min;
    const value = spec.fromDisplay ? spec.fromDisplay(target) : target;
    const strings = [...jawari.strings] as ThamburaPlan["strings"];
    strings[1] = writeField(start, spec.field, value);
    const plan = { ...jawari, strings };
    expectSamePlan(decodeLink(encodeLink(setup({ mode: "custom" }, plan)), current)!.custom!, plan);
  });

  it("notices when the starting sound has changed since the link was made", () => {
    const plan = labEdits(mulberry32(5), jawari, 2);
    const bytes = [...atob(encodeLink(setup({ mode: "custom" }, plan)).replace(/-/g, "+").replace(/_/g, "/"))];
    expect(bytes[13].charCodeAt(0)).toBe(0); // stored as edits to the jawari plan
    bytes[14] = String.fromCharCode(bytes[14].charCodeAt(0) ^ 0xff);
    const tampered = btoa(bytes.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeLink(tampered, current)!.drifted).toBe(true);
  });

  it("rejects anything that isn't a whole link", () => {
    const good = encodeLink(setup({ mode: "custom" }, labEdits(mulberry32(2), jawari, 3)));
    for (const bad of ["", "!!", "AAAA", good.slice(0, -3), `${good}AAAA`, `C${good.slice(1)}`]) {
      expect(decodeLink(bad, current)).toBeNull();
    }
  });

  it("clamps values outside the app's ranges", () => {
    // Format 1, key 200, cents +100, cycle 100 s.
    const bytes = [1, 0, 0, 200, 164, 7, 0x11, 0x30, 0x27, 0x10, 50, 50, 60];
    const link = btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
    const d = decodeLink(link, current)!;
    expect(d.settings.key).toBe(KEYS.length - 1);
    expect(d.settings.cents).toBe(50);
    expect(d.settings.cycleSeconds).toBe(8);
  });
});

describe("presets that ship with the app", () => {
  it("each carry a readable link and a name", () => {
    expect(BUILT_IN_PRESETS.map((p) => p.name)).toEqual(["Shimmer", "Warm"]);
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.id.startsWith("builtin:")).toBe(true);
      const d = decodeLink(preset.link, current);
      expect(d, preset.name).not.toBeNull();
      expect(d!.settings.mode).toBe("custom");
      expect(d!.custom).not.toBeNull();
      expect(d!.drifted, `${preset.name} was made from an older built-in sound`).toBe(false);
    }
  });
});
