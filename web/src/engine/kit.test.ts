import { describe, expect, it } from "vitest";
import { kitUrls, nearestPack, packHz, parseKit, shiftCents, strokeSound, type Kit } from "./kit";

const KIT_JSON = {
  kit: "test",
  name: "Test kit",
  instrument: "mridangam",
  zones: [
    { id: "valanthalai", label: "Valanthalai (right)" },
    { id: "thoppi", label: "Thoppi (left)" },
  ],
  packs: [
    { id: "c", label: "C", hz: 261.63, cents: 5 },
    { id: "d", label: "D", hz: 293.66, cents: -19 },
    { id: "e", label: "E", hz: 329.63, cents: -4 },
  ],
  strokes: [
    { id: "R.chapu", label: "Chapu", zone: "valanthalai", open: true, note: "the tuning stroke", takes: { c: ["cha-c-1.wav", "cha-c-2.wav"], d: ["cha-d-1.wav"], e: ["cha-e-1.wav"] } },
    { id: "R.ta", label: "Ta", zone: "valanthalai", open: false, note: "closed", takes: { c: ["ta-c-1.wav"], d: ["ta-d-1.wav"], e: ["ta-e-1.wav"] } },
    // Only recorded at one pack, as bheem is in the real dataset.
    { id: "L.thom", label: "Thom", zone: "thoppi", open: true, note: "open bass", takes: { e: ["thom-e-1.wav"] } },
  ],
};

const kit: Kit = parseKit(KIT_JSON);
const C4 = 261.63;
const C3 = C4 / 2;
const D3 = 293.66 / 2;

describe("parseKit", () => {
  it("reads packs and strokes", () => {
    expect(kit.name).toBe("Test kit");
    expect(kit.packs.map((p) => p.id)).toEqual(["c", "d", "e"]);
    expect(kit.instrument).toBe("mridangam");
    expect(kit.zones.map((z) => z.id)).toEqual(["valanthalai", "thoppi"]);
    expect(kit.strokes[0]).toMatchObject({ id: "R.chapu", zone: "valanthalai", open: true });
    expect(kit.strokes[1].open).toBe(false);
  });

  it("defaults the parts a manifest may leave out", () => {
    const bare = parseKit({
      zones: [{ id: "head" }],
      packs: [{ id: "c", label: "C", hz: 261.63 }],
      strokes: [{ id: "R.chapu", zone: "head", takes: {} }],
    });
    expect(bare.packs[0].cents).toBe(0);
    expect(bare.zones[0].label).toBe("head");
    expect(bare.instrument).toBe("instrument");
    expect(bare.strokes[0]).toMatchObject({ label: "R.chapu", open: true, note: "" });
  });

  it("rejects a manifest it can't trust", () => {
    expect(() => parseKit(null)).toThrow();
    const packs = [{ id: "c", label: "C", hz: 261.63 }];
    const zones = [{ id: "head", label: "Head" }];
    expect(() => parseKit({ zones, packs: [], strokes: [] })).toThrow(/no packs/);
    expect(() => parseKit({ zones: [], packs, strokes: [] })).toThrow(/no zones/);
    expect(() => parseKit({ zones, packs, strokes: [] })).toThrow(/no strokes/);
    expect(() => parseKit({ zones, packs, strokes: [{ id: "x", zone: "rim", takes: {} }] })).toThrow(/unknown zone/);
    expect(() => parseKit({ zones, packs, strokes: [{ id: "x", zone: "head", takes: { f: ["a.wav"] } }] })).toThrow(
      /unknown pack/,
    );
  });
});

describe("tuning a kit to the shruthi", () => {
  it("sounds the pitch its measured offset says, not its name", () => {
    expect(packHz(kit.packs[0])).toBeCloseTo(261.63 * 2 ** (5 / 1200), 6);
  });

  it("matches a pack by pitch class, so the octave takes care of itself", () => {
    // The drum sounds an octave above the singer's Sa, so pack C suits Sa = C3.
    expect(nearestPack(kit, C3)?.id).toBe("c");
    expect(nearestPack(kit, C4)?.id).toBe("c");
    expect(nearestPack(kit, D3)?.id).toBe("d");
  });

  it("shifts only the few cents the pack is out by", () => {
    expect(shiftCents(kit.packs[0], C3)).toBeCloseTo(-5, 6);
    expect(shiftCents(kit.packs[1], D3)).toBeCloseTo(19, 6);
  });

  it("goes the short way round, never by an octave", () => {
    for (const hz of [C3, C4, D3, 440, 123.5]) {
      const pack = nearestPack(kit, hz)!;
      expect(Math.abs(shiftCents(pack, hz))).toBeLessThanOrEqual(600);
    }
  });

  it("picks the nearest pack that has the stroke at all", () => {
    // Thom is only recorded at E, so at Sa = C3 it comes from E, shifted far.
    const thom = strokeSound(kit, "L.thom", C3)!;
    expect(thom.url).toBe("thom-e-1.wav");
    expect(Math.round(thom.detune)).toBe(shiftRound(kit, "e", C3));
    expect(strokeSound(kit, "R.chapu", C3)!.url).toBe("cha-c-1.wav");
  });

  it("lets the caller choose the take, and resolves it against the kit's folder", () => {
    const sound = strokeSound(kit, "R.chapu", C3, (takes) => takes[1], "/static/Resources/Mridangam/test/")!;
    expect(sound.url).toBe("/static/Resources/Mridangam/test/cha-c-2.wav");
    expect(sound).toMatchObject({ zone: "valanthalai", open: true });
  });

  it("has nothing to play for a stroke the kit doesn't have", () => {
    expect(strokeSound(kit, "R.gumki", C3)).toBeNull();
  });

  it("lists what to preload for one tonic, without repeats", () => {
    const urls = kitUrls(kit, C3, "/kit/");
    expect(urls).toEqual(["/kit/cha-c-1.wav", "/kit/cha-c-2.wav", "/kit/ta-c-1.wav", "/kit/thom-e-1.wav"]);
  });
});

function shiftRound(kit: Kit, packId: string, hz: number): number {
  return Math.round(shiftCents(kit.packs.find((p) => p.id === packId)!, hz));
}
