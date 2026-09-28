import { describe, expect, it } from "vitest";
import { ratio, ZERO } from "./ratio";
import { beatsFor, type TalaSettings } from "./selection";
import { TalaGrid } from "./talaGrid";
import { PATTERNS, patternFor, type Pattern } from "./patterns";

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
  const adi = PATTERNS.find((p) => p.id === "adi-chatusram-1") as Pattern;

  it("compiles the Adi sarvalaghu from its .not source", () => {
    expect(adi).toBeDefined();
    expect(adi.beats).toBe(8);
    expect(adi.nadai).toBe("chatusram");
    expect(adi.strokes).toHaveLength(10);
    // Its left-hand tha with nam plays tham, marked, until #80 records it.
    expect(adi.strokes.filter((x) => x.standIn).map((x) => [x.stroke, x.at.n / x.at.d])).toEqual([
      ["L.tham", 0],
      ["L.tham", 0.5],
      ["L.tham", 0.75],
    ]);
    // Positions are fractions of the cycle, and Adi's eight aksharas carry
    // four slots each, so every stroke lands on a quarter of an akshara.
    for (const stroke of adi.strokes) {
      const akshara = (stroke.at.n / stroke.at.d) * 8;
      expect(akshara).toBeGreaterThanOrEqual(0);
      expect(akshara).toBeLessThan(8);
      expect((akshara * 4) % 1).toBe(0);
    }
    // Sam is leaned on, the akshara after it is not.
    expect(adi.strokes[0].gain).toBeGreaterThan(1);
    expect(adi.strokes.find((x) => (x.at.n / x.at.d) * 8 === 1)!.gain).toBe(1);
  });

  it("fits the Adi pattern to Adi and to a chatusra Thriputa, the same eight beats", () => {
    expect(patternFor(gridFor(), "chatusram")).toBe(adi);
    expect(patternFor(gridFor({ tala: "sapta_thriputa", jaathi: "chatusram" }), "chatusram")).toBe(adi);
    expect(patternFor(gridFor({ kalai: 4 }), "chatusram")).toBe(adi);
  });

  it("has nothing for a tala or nadai it wasn't written for", () => {
    expect(patternFor(gridFor({ tala: "sapta_eka" }), "chatusram")).toBeNull();
    // Matya in thisram is also eight beats, but its claps fall elsewhere.
    expect(gridFor({ tala: "sapta_matya", jaathi: "thisram" }).beatCount).toBe(8);
    expect(patternFor(gridFor({ tala: "sapta_matya", jaathi: "thisram" }), "chatusram")).toBeNull();
    expect(patternFor(gridFor(), "misram")).toBeNull();
  });

  it("gives a chaapu its pattern whatever the nadai says", () => {
    // A chaapu is one long beat in our tables and ignores nadai, so its
    // patterns match on shape alone.
    for (const nadai of ["chatusram", "misram", "khandam"] as const) {
      expect(patternFor(gridFor({ tala: "chaapu_misram" }), nadai)?.id).toBe("misra-chaapu-1");
      expect(patternFor(gridFor({ tala: "chaapu_khandam" }), nadai)?.id).toBe("khanda-chaapu-1");
    }
  });

  it("spreads a chaapu's strokes across its one long beat", () => {
    const misra = PATTERNS.find((p) => p.id === "misra-chaapu-1") as Pattern;
    const grid = gridFor({ tala: "chaapu_misram" });
    expect(grid.beatCount).toBe(1);
    expect(grid.cycleCounts).toEqual(ratio(7, 2));
    // Seven aksharas: one stroke each, with the fourth split in two.
    expect(misra.strokes).toHaveLength(8);
    expect(misra.strokes.map((s) => (s.at.n / s.at.d) * 7)).toEqual([0, 1, 2, 3, 3.5, 4, 5, 6]);
  });
});
