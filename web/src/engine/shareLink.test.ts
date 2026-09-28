import { describe, expect, it } from "vitest";
import { mulberry32 } from "./tambura";
import { BUILT_IN_PRESETS } from "./presets";
import {
  barOpen,
  decodeLink,
  decodePage,
  decodeHands,
  decodeKit,
  decodeSession,
  encodeHands,
  encodeKit,
  encodeLink,
  encodePage,
  encodeSession,
  withBarOpen,
  type SessionSetup,
  type SharedSetup,
} from "./shareLink";
import { DEFAULT_SETTINGS, TALA_OPTIONS } from "./selection";
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
  it("carries every setting, the volume too", () => {
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
      expect(d.settings).toEqual(settings);
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
    expect(link.length).toBeLessThanOrEqual(34);
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
    expect(bytes[14].charCodeAt(0)).toBe(0); // stored as edits to the jawari plan
    bytes[15] = String.fromCharCode(bytes[15].charCodeAt(0) ^ 0xff);
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

describe("the bar's open flag", () => {
  const bytes = (link: string) => Uint8Array.from(atob(link.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  it("is read from a link", () => {
    expect(barOpen(encodeLink(setup({}, jawari, { open: true })))).toBe(true);
    expect(barOpen(encodeLink(setup()))).toBe(false);
  });

  it("is set without changing anything else the link carries", () => {
    const rng = mulberry32(5);
    for (const s of [setup({ key: 3 }, jawari, { view: "lab" }), setup({ mode: "custom" }, labEdits(rng, jawari, 4))]) {
      const closed = encodeLink(s);
      const opened = withBarOpen(closed, true);
      expect(opened).toBe(encodeLink({ ...s, open: true }));
      expect(barOpen(opened)).toBe(true);
      expect(withBarOpen(opened, false)).toBe(closed);
      expect({ ...decodeLink(opened, current), open: false }).toEqual(decodeLink(closed, current));
      // Only the flags byte differs.
      const a = bytes(closed);
      const b = bytes(opened);
      expect(b.length).toBe(a.length);
      expect([...a].map((v, i) => (v === b[i] ? -1 : i)).filter((i) => i >= 0)).toEqual([1]);
    }
  });

  it("leaves a link it can't read alone", () => {
    for (const bad of ["", "!!", "AAAA", `C${encodeLink(setup()).slice(1)}`]) {
      expect(barOpen(bad)).toBeNull();
      expect(withBarOpen(bad, true)).toBe(bad);
    }
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

/**
 * Links made by format 1, written down as they were sent. People keep links
 * (and presets are links), so these must go on opening the same sound for
 * as long as format 1 is read (docs: reference/share-link-format). A failure
 * here means the format changed: put the old reading back, and put anything
 * new behind a FORMAT bump.
 */
describe("format 1 links keep opening the same", () => {
  const bytes = (link: string) => Uint8Array.from(atob(link.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const open = (link: string) => {
    const d = decodeLink(link, current);
    expect(d, link).not.toBeNull();
    return d!;
  };

  it("a plain setup", () => {
    const d = open("AQgAA0AHETABwjIyPA");
    expect(d.settings).toEqual({ ...DEFAULT_THAMBURA, volume: 37 });
    expect(d.view).toBe("studio");
    expect(d.open).toBe(false);
    expect(d.custom).toBeNull();
  });

  it("every flag, the view and the bar", () => {
    const d = open("AR8BCTQFEUQBRR5GNw");
    expect(d.settings).toEqual({
      key: 9, cents: -12, voice: "ladies", firstString: "Ma1", temperament: "equal", a4: 442,
      mode: "tambura", cycleSeconds: 3.25, volume: 37, tone: 30, pluck: 70, sustain: 55,
    });
    expect(d.view).toBe("lab");
    expect(d.open).toBe(true);
  });

  it("sruti mode", () => {
    const d = open("ARAEA0AHETABwjIyPA");
    expect(d.settings.mode).toBe("sruti");
    expect(d.view).toBe("raagini");
  });

  it("a Custom plan as edits: one string's level", () => {
    const d = open("ARgDA0AHETABwjIyPADY5gFACD_gAAAAAAAAAA");
    expect(bytes("ARgDA0AHETABwjIyPADY5gFACD_gAAAAAAAAAA")[13] & 0x80).toBe(0);
    expect(d.drifted).toBe(false);
    expect(d.custom!.strings.map((s) => s.level)).toEqual([...jawari.strings.slice(0, 3).map((s) => s.level), 0.5]);
  });

  it("a Custom plan as a whole, against guitar", () => {
    const link =
      "AQgDA0AHETABwjIyPIJaujsSChQOPwMWMgNTE2UDFQMAIwcQFyUDA8sBEjYPBxELPAATLwBQEGIAEgBkIAQNFCIAAMgBFjsUDBYQQQUYNAVVFWcFFwUAJQkSGScFBc0BFzoNBQ8JOgARLQBODmAAEABiHgILEiAAAMYBFwAH0AfQB9APoAA";
    expect(bytes(link)[13]).toBe(0x80 | 2);
    const d = open(link);
    expect(d.drifted).toBe(false);
    d.custom!.strings.forEach((s, i) => {
      expect(s.voice.ringSeconds).toBeCloseTo([6.5, 5, 7.5, 4][i], 12);
      expect(s.pan).toBeCloseTo([-0.2, 0, 0.05, 0.05][i], 12);
    });
    d.custom!.gaps.forEach((g, i) => expect(g).toBeCloseTo([0.2, 0.2, 0.2, 0.4][i], 4));
  });

  it("a hidden value the Lab doesn't show", () => {
    const d = open("AQgDA0AHETABwjIyPADY5gABAAJAJwAAAAAAAA");
    expect(d.custom!.strings.map((s) => s.voice.seconds)).toEqual([9, 11.5, 9, 9]);
  });

  it("the Shimmer preset, the reference page's worked example", () => {
    const d = open(BUILT_IN_PRESETS[0].link);
    expect(BUILT_IN_PRESETS[0].link).toBe("ARwDBEAHETABLDIyPADY5g8BDwcCDxEED2MFDwMGDwAHDxQJB1wJCDQKD2QLDxYMDzUNDzQODxgPDzcYBOEBAA");
    expect(d.settings).toEqual({ ...DEFAULT_THAMBURA, key: 4, mode: "custom", cycleSeconds: 3, volume: 37 });
    expect(d.custom!.strings.map((s) => [s.level, s.voice.ringSeconds, s.damp, s.voice.formantDb])).toEqual([
      [0.8, 50, 0, 46],
      [0.7, 50, 0, 46],
      [0.7, 50, 0, 46],
      [1, 50, 0, 26],
    ]);
    d.custom!.gaps.forEach((g, i) => expect(g).toBeCloseTo([0.3, 0.205, 0.205, 0.29][i], 4));
  });
});

/**
 * Format 3 is format 1 with the thambura's volume after sustain (#153). As
 * with format 1, these are links as they were written; a failure means the
 * format changed.
 */
describe("format 3 links keep opening the same", () => {
  it("a plain setup at volume 20", () => {
    const d = decodeLink("AwgAA0AHETABwjIyPBQ", current)!;
    expect(d.settings).toEqual({ ...DEFAULT_THAMBURA, volume: 20 });
    expect(encodeLink(setup({ volume: 20 }))).toBe("AwgAA0AHETABwjIyPBQ");
  });

  it("clamps a volume past 100", () => {
    expect(decodeLink("AwgAA0AHETABwjIyPP8", current)!.settings.volume).toBe(100);
  });
});

describe("page links: every instrument on the page in one link", () => {
  const one = encodeLink(setup({ key: 3 }));
  const two = encodeLink(setup({ key: 9, mode: "tambura" }, jawari, { view: "lab" }));

  it("writes a page with only thambura-1 as that thambura's own link, byte for byte", () => {
    expect(encodePage([{ id: "thambura-1", link: one }])).toBe(one);
  });

  it("reads a single-thambura link as thambura-1, of either format", () => {
    expect(decodePage(one)).toEqual(new Map([["thambura-1", one]]));
    expect(decodePage("AQgAA0AHETABwjIyPA")).toEqual(new Map([["thambura-1", "AQgAA0AHETABwjIyPA"]]));
  });

  it("carries several thamburas, each part exactly as it was", () => {
    const page = encodePage([
      { id: "thambura-1", link: one },
      { id: "thambura-2", link: two },
    ]);
    expect(page).not.toBe(one);
    expect(decodePage(page)).toEqual(
      new Map([
        ["thambura-1", one],
        ["thambura-2", two],
      ]),
    );
    // Each part still decodes to its sound, bar flag and all.
    expect(decodeLink(decodePage(page)!.get("thambura-2")!, current)!.settings.key).toBe(9);
  });

  it("uses the container when the only thambura isn't thambura-1", () => {
    const page = encodePage([{ id: "thambura-2", link: two }]);
    expect(page).not.toBe(two);
    expect(decodePage(page)).toEqual(new Map([["thambura-2", two]]));
  });

  it("skips a part of a kind it doesn't know and reads the rest", () => {
    const page = encodePage([
      { id: "thambura-1", link: one },
      { id: "gong-1", link: "AQID" },
    ]);
    expect(decodePage(page)).toEqual(new Map([["thambura-1", one]]));
    // A part a newer version wrote, for a kind this version has never heard of.
    const bytes = Uint8Array.from(atob(page.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const future = new Uint8Array([...bytes, 200, 1, 2, 7, 7]);
    const futureLink = btoa(String.fromCharCode(...future)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodePage(futureLink)).toEqual(new Map([["thambura-1", one]]));
  });

  it("refuses what isn't a page link", () => {
    expect(decodePage("not a link!")).toBeNull();
    expect(decodePage("")).toBeNull();
    const page = encodePage([
      { id: "thambura-1", link: one },
      { id: "thambura-2", link: two },
    ]);
    expect(decodePage(page.slice(0, 6))).toBeNull(); // cut short inside a part
  });

  it("drops a thambura part that isn't a thambura link, rather than the whole page", () => {
    const page = encodePage([
      { id: "thambura-1", link: one },
      { id: "thambura-2", link: "Zm9v" },
    ]);
    expect(decodePage(page)).toEqual(new Map([["thambura-1", one]]));
  });
});

describe("session part", () => {
  const session = (rest: Partial<SessionSetup> = {}): SessionSetup => ({
    tala: { tala: "chaapu_misram", jaathi: "khandam", nadai: "thisram", kalai: 2 },
    tempo: 132,
    pitch: { key: 4, cents: -12, a4: 441.5 },
    ...rest,
  });

  it("carries the tala, the speed and the shruthi in 11 bytes", () => {
    const part = encodeSession(session());
    expect(decodeSession(part)).toEqual(session());
    expect(part.length).toBe(15);
  });

  it("round-trips every tala on the menu", () => {
    for (const o of TALA_OPTIONS.flatMap((g) => g.options)) {
      const s = session({ tala: { ...DEFAULT_SETTINGS, tala: o.value } });
      expect(decodeSession(encodeSession(s))?.tala.tala).toBe(o.value);
    }
  });

  it("clamps what it reads and refuses what isn't one", () => {
    const wild = encodeSession(session({ tempo: 900, pitch: { key: 3, cents: 50, a4: 440 } }));
    expect(decodeSession(wild)?.tempo).toBe(300);
    expect(decodeSession("")).toBeNull();
    expect(decodeSession("not a link!")).toBeNull();
    // A thambura link isn't a session part, and a session part with bytes left over isn't either.
    expect(decodeSession(encodeLink(setup()))).toBeNull();
    expect(decodeSession(encodeSession(session()) + "AA")).toBeNull();
  });

  it("travels in a page link beside the thambura, and a bad one is skipped", () => {
    const thambura = encodeLink(setup({ key: 7 }));
    const part = encodeSession(session());
    const page = encodePage([
      { id: "thambura-1", link: thambura },
      { id: "session-1", link: part },
    ]);
    expect(decodePage(page)).toEqual(
      new Map([
        ["thambura-1", thambura],
        ["session-1", part],
      ]),
    );
    const bad = encodePage([
      { id: "thambura-1", link: thambura },
      { id: "session-1", link: thambura },
    ]);
    expect(decodePage(bad)).toEqual(new Map([["thambura-1", thambura]]));
  });
});

describe("hands and kit parts", () => {
  it("carry the claps' sound group and volume, whatever the group is called", () => {
    for (const soundGroup of ["Clap", "Metronome", "தாளம்", ""]) {
      expect(decodeHands(encodeHands({ soundGroup, volume: 35 }))).toEqual({ soundGroup, volume: 35 });
    }
  });

  it("carry which kit, its Variety, volume and whether it plays along", () => {
    const kit = { kit: 2, variety: "lots" as const, volume: 64, enabled: false };
    expect(decodeKit(encodeKit(kit))).toEqual(kit);
  });

  it("refuse each other's payloads and anything short or long", () => {
    const hands = encodeHands({ soundGroup: "Clap", volume: 50 });
    const kit = encodeKit({ kit: 0, variety: "some", volume: 70, enabled: true });
    expect(decodeKit(hands)).toBeNull();
    expect(decodeHands(kit.slice(0, 3))).toBeNull();
    expect(decodeKit(kit + "AA")).toBeNull();
  });

  it("travel in a page link, one part per instrument", () => {
    const parts = [
      { id: "hands-1", link: encodeHands({ soundGroup: "Clap", volume: 50 }) },
      { id: "kit-1", link: encodeKit({ kit: 0, variety: "some", volume: 70, enabled: true }) },
      { id: "kit-2", link: encodeKit({ kit: 1, variety: "off", volume: 40, enabled: true }) },
    ];
    expect([...decodePage(encodePage(parts))!]).toEqual(parts.map((p) => [p.id, p.link]));
  });
});
