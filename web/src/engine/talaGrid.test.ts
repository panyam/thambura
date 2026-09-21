import { describe, expect, it } from "vitest";
import { ratio, ZERO } from "./ratio";
import { beatsFor, type TalaSettings } from "./selection";
import { TalaGrid } from "./talaGrid";
import { ADI_CHATUSRAM, pattern, patternFor } from "./thekas";

const settings = (patch: Partial<TalaSettings> = {}): TalaSettings => ({
  tala: "custom_adi",
  jaathi: "chatusram",
  nadai: "chatusram",
  kalai: 1,
  ...patch,
});

const gridFor = (patch: Partial<TalaSettings> = {}) => {
  const s = settings(patch);
  return new TalaGrid(beatsFor(s), s.kalai);
};

describe("TalaGrid", () => {
  it("measures a cycle in counts", () => {
    expect(gridFor().cycleCounts).toEqual(ratio(8));
    expect(gridFor({ tala: "sapta_thriputa", jaathi: "misram" }).cycleCounts).toEqual(ratio(11));
    expect(gridFor({ tala: "chaapu_misram" }).cycleCounts).toEqual(ratio(7, 2));
  });

  it("stretches with kalai, keeping the same beats", () => {
    const g = gridFor({ kalai: 2 });
    expect(g.beatCount).toBe(8);
    expect(g.aksharaCount).toBe(16);
    expect(g.cycleCounts).toEqual(ratio(16));
    expect(g.aksharaStart(1)).toEqual(ratio(1));
  });

  it("says whether the aksharas are even, which a written pattern needs", () => {
    expect(gridFor().uniform).toBe(true);
    expect(gridFor().countsPerBeat).toEqual(ratio(1));
    // Kalai stretches the beat a pattern is written against.
    expect(gridFor({ kalai: 2 }).countsPerBeat).toEqual(ratio(2));
    expect(gridFor({ tala: "chaapu_misram" }).countsPerBeat).toEqual(ratio(7, 2));
  });

  it("places a count in its cycle, beat and repeat", () => {
    const g = gridFor({ kalai: 2 }); // 16 aksharas of one count
    expect(g.at(ZERO)).toMatchObject({ cycle: 0, beat: 0, repeat: 0 });
    expect(g.at(ratio(1))).toMatchObject({ cycle: 0, beat: 0, repeat: 1 });
    expect(g.at(ratio(2))).toMatchObject({ cycle: 0, beat: 1, repeat: 0 });
    expect(g.at(ratio(17))).toMatchObject({ cycle: 1, beat: 0, repeat: 1 });
    expect(g.at(ratio(3, 2))).toMatchObject({ beat: 0, repeat: 1, into: ratio(1, 2) });
  });

  it("puts cycle starts a cycle apart", () => {
    const g = gridFor();
    expect(g.cycleStart(0)).toEqual(ZERO);
    expect(g.cycleStart(3)).toEqual(ratio(24));
  });

  it("copes with no beats at all", () => {
    const g = new TalaGrid([]);
    expect(g.cycleCounts).toEqual(ZERO);
    expect(g.at(ratio(4))).toMatchObject({ cycle: 0, beat: 0 });
  });
});

describe("patterns", () => {
  it("lays a written line out in aksharas", () => {
    const p = pattern("t", "Test", "chatusram", "L.thom , R.nam , | R.thi R.thi , ,");
    expect(p.beats).toBe(2);
    expect(p.strokes.map((s) => [s.stroke, s.at.n / s.at.d])).toEqual([
      ["L.thom", 0],
      ["R.nam", 0.5],
      ["R.thi", 1],
      ["R.thi", 1.25],
    ]);
  });

  it("rejects an akshara with the wrong number of slots", () => {
    expect(() => pattern("t", "Test", "chatusram", "L.thom , R.nam , | R.thi ,")).toThrow(/slots/);
  });

  it("fits the Adi theka to Adi and to a chatusra Thriputa, both eight aksharas", () => {
    expect(patternFor(gridFor(), "chatusram")).toBe(ADI_CHATUSRAM);
    expect(patternFor(gridFor({ tala: "sapta_thriputa", jaathi: "chatusram" }), "chatusram")).toBe(ADI_CHATUSRAM);
    expect(patternFor(gridFor({ kalai: 4 }), "chatusram")).toBe(ADI_CHATUSRAM);
  });

  it("has nothing for a tala or nadai it wasn't written for", () => {
    expect(patternFor(gridFor({ tala: "sapta_eka" }), "chatusram")).toBeNull();
    expect(patternFor(gridFor(), "misram")).toBeNull();
    expect(patternFor(gridFor({ tala: "chaapu_misram" }), "chatusram")).toBeNull();
  });

  it("keeps every stroke of the Adi theka inside its cycle", () => {
    expect(ADI_CHATUSRAM.beats).toBe(8);
    for (const s of ADI_CHATUSRAM.strokes) {
      expect(s.at.n / s.at.d).toBeGreaterThanOrEqual(0);
      expect(s.at.n / s.at.d).toBeLessThan(8);
    }
  });
});
