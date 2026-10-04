import { describe, expect, it } from "vitest";
import { arrangementFor, korvaiCycles, patternForCycle, type Arrangement } from "./arrangement";
import { PATTERNS, patternFor, type Pattern } from "./patterns";
import { ratio as r } from "./ratio";
import { beatsFor, type TalaSettings } from "./selection";
import { TalaGrid } from "./talaGrid";

const setup = (patch: Partial<TalaSettings> = {}) => {
  const settings: TalaSettings = {
    tala: "custom_adi",
    jaathi: "chatusram",
    nadai: "chatusram",
    kalai: 1,
    ...patch,
  };
  const grid = new TalaGrid(beatsFor(settings), settings.kalai);
  const main = patternFor(grid, settings.nadai);
  return arrangementFor(grid, settings.nadai, main)!;
};

/** A draw that walks a fixed list, so a choice can be pinned down. */
const draws = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("arrangementFor", () => {
  it("collects the alternates written for the same cycle", () => {
    const adi = setup();
    expect(adi.main.id).toBe("adi-chatusram-1");
    expect(adi.variations.map((p) => p.id)).toEqual(["adi-chatusram-2"]);
    // Every alternate really is one, and fits the same cycle.
    for (const v of adi.variations) {
      expect(v.role).toBe("variation");
      expect(v.shape).toBe(adi.main.shape);
      expect(v.counts).toEqual(adi.main.counts);
    }
  });

  it("finds a chaapu's alternates, which ignore nadai", () => {
    const misra = setup({ tala: "chaapu_misram" });
    expect(misra.main.id).toBe("misra-chaapu-1");
    expect(misra.variations.map((p) => p.id)).toEqual(["misra-chaapu-2"]);
    expect(setup({ tala: "chaapu_misram", nadai: "khandam" }).variations).toHaveLength(1);
  });

  it("keeps Misra Chaapu's alternates off Viloma Chaapu, the same length with other ticks", () => {
    const grid = new TalaGrid(beatsFor({ tala: "chaapu_vilomam", jaathi: "chatusram", nadai: "chatusram", kalai: 1 }));
    expect(patternFor(grid, "chatusram")).toBeNull();
    const main = PATTERNS.find((p) => p.id === "misra-chaapu-1")!;
    expect(arrangementFor(grid, "chatusram", main)!.variations).toEqual([]);
  });

  it("finds Khanda Chaapu's and Short Rupakam's alternates", () => {
    expect(setup({ tala: "chaapu_khandam" }).variations.map((p) => p.id)).toEqual(["khanda-chaapu-2"]);
    expect(setup({ tala: "custom_rupakam" }).variations.map((p) => p.id)).toEqual(["rupakam-chatusram-2"]);
  });

  it("has no alternates where nobody has written any", () => {
    const grid = new TalaGrid(beatsFor({ tala: "chaapu_khandam", jaathi: "chatusram", nadai: "chatusram", kalai: 1 }));
    const main = PATTERNS.find((p) => p.id === "khanda-chaapu-1")!;
    expect(arrangementFor(grid, "chatusram", main, [main])!.variations).toEqual([]);
  });

  it("is nothing at all without a main pattern", () => {
    const grid = new TalaGrid(beatsFor({ tala: "sapta_ata", jaathi: "chatusram", nadai: "chatusram", kalai: 1 }), 1);
    expect(arrangementFor(grid, "chatusram", null)).toBeNull();
  });
});

describe("the korvai", () => {
  it("is found for a tala that has one", () => {
    expect(setup().korvai?.id).toBe("adi-korvai-1");
    expect(setup().korvai?.role).toBe("korvai");
  });

  it("is absent where nobody has written one", () => {
    expect(setup({ tala: "chaapu_khandam" }).korvai).toBeNull();
  });

  it("is Misra Chaapu's tirmanam: a phrase three times, joined by thom with din, in one cycle", () => {
    const korvai = setup({ tala: "chaapu_misram" }).korvai!;
    expect(korvai.id).toBe("misra-chaapu-korvai-1");
    expect(korvai.aksharas).toBe(7);
    // Eight slots of phrase and two of join, so the phrase starts at 0, 10 and 20 of 28.
    const slots = (from: number, len: number) =>
      korvai.strokes
        .map((x) => ({ slot: (x.at.n / x.at.d) * 28, stroke: x.stroke }))
        .filter((x) => x.slot >= from && x.slot < from + len)
        .map((x) => `${x.slot - from}:${x.stroke}`);
    expect(slots(0, 8)).toEqual(["0:R.ta", "1:R.thi", "2:L.thom", "3:L.thom", "4:R.thi", "5:L.thom", "6:L.thom", "7:R.thi"]);
    expect(slots(10, 8)).toEqual(slots(0, 8));
    expect(slots(20, 8)).toEqual(slots(0, 8));
    expect(slots(8, 2)).toEqual(["0:L.dheem"]);
    expect(slots(18, 2)).toEqual(["0:L.dheem"]);
  });

  it("fills exactly one cycle, so it resolves on the next sam", () => {
    const korvai = setup().korvai!;
    expect(korvai.aksharas).toBe(8);
    for (const stroke of korvai.strokes) {
      const at = stroke.at.n / stroke.at.d;
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(1);
    }
    // It is one phrase of eight slots, three times, joined by four more, so
    // the phrase repeats at slots 0, 12 and 24 of the cycle's 32.
    const slots = (from: number) =>
      korvai.strokes
        .map((x) => ({ slot: (x.at.n / x.at.d) * 32, stroke: x.stroke }))
        .filter((x) => x.slot >= from && x.slot < from + 8)
        .map((x) => `${x.slot - from}:${x.stroke}`);
    expect(slots(12)).toEqual(slots(0));
    expect(slots(24)).toEqual(slots(0));
    expect(slots(0)).toEqual(["0:R.thi", "1:L.thom", "2:L.thom", "3:R.thi", "4:L.thom", "5:R.thi", "6:R.thi"]);
  });

  it("is never chosen by the cycle draw: it is asked for", () => {
    const a = setup();
    for (let cycle = 0; cycle < 50; cycle++) {
      expect(patternForCycle(a, cycle, "lots", Math.random).role).not.toBe("korvai");
    }
  });
});

describe("patternForCycle", () => {
  const adi = () => setup();

  it("opens on the main pattern, whatever the draw says", () => {
    expect(patternForCycle(adi(), 0, "lots", draws([0])).id).toBe("adi-chatusram-1");
  });

  it("never varies when variety is off", () => {
    const a = adi();
    for (let cycle = 1; cycle < 8; cycle++) {
      expect(patternForCycle(a, cycle, "off", draws([0])).id).toBe("adi-chatusram-1");
    }
  });

  it("takes a variation when the draw falls under the chance", () => {
    const a = adi();
    // "some" is 0.3: a draw of 0.1 varies, 0.9 doesn't.
    expect(patternForCycle(a, 1, "some", draws([0.1, 0])).id).toBe("adi-chatusram-2");
    expect(patternForCycle(a, 1, "some", draws([0.9])).id).toBe("adi-chatusram-1");
    // "lots" is 0.7, so the same 0.5 draw varies where "some" would not.
    expect(patternForCycle(a, 1, "lots", draws([0.5, 0])).id).toBe("adi-chatusram-2");
    expect(patternForCycle(a, 1, "some", draws([0.5])).id).toBe("adi-chatusram-1");
  });

  it("stays on the main pattern when there is nothing to swap in", () => {
    const main = PATTERNS.find((p) => p.id === "khanda-chaapu-1")!;
    expect(patternForCycle({ main, variations: [], korvai: null }, 3, "lots", draws([0])).id).toBe("khanda-chaapu-1");
  });

  it("varies about as often as asked over a long run", () => {
    const a = adi();
    let seed = 1;
    // A small deterministic generator, so the count is repeatable.
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const counts: Record<string, number> = { main: 0, variation: 0 };
    for (let cycle = 1; cycle <= 400; cycle++) {
      counts[patternForCycle(a, cycle, "some", rng).role]++;
    }
    const share = counts.variation / (counts.main + counts.variation);
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
  });

  it("picks among several alternates", () => {
    const three: Arrangement = {
      main: PATTERNS[0],
      variations: [
        { ...PATTERNS[0], id: "v1" } as Pattern,
        { ...PATTERNS[0], id: "v2" } as Pattern,
        { ...PATTERNS[0], id: "v3" } as Pattern,
      ],
      korvai: null,
    };
    expect(patternForCycle(three, 1, "lots", draws([0, 0])).id).toBe("v1");
    expect(patternForCycle(three, 1, "lots", draws([0, 0.5])).id).toBe("v2");
    expect(patternForCycle(three, 1, "lots", draws([0, 0.99])).id).toBe("v3");
  });
});

describe("korvaiCycles", () => {
  const main: Pattern = {
    ...PATTERNS.find((p) => p.id === "adi-chatusram-1")!,
    strokes: [0, 1, 2, 3].map((i) => ({ at: r(i, 4), stroke: "M", gain: 1 })),
  };
  const korvai = (counts: number, ats: [number, number][]): Pattern => ({
    ...main,
    id: "k",
    name: "K",
    role: "korvai",
    counts: r(counts),
    strokes: ats.map(([n, d]) => ({ at: r(n, d), stroke: "K", gain: 1 })),
  });
  const show = (pieces: Pattern[]) => pieces.map((p) => p.strokes.map((s) => `${s.stroke}@${s.at.n}/${s.at.d}`).join(" "));

  it("starts a korvai two and a half cycles long halfway into a cycle, so it ends on sam", () => {
    const pieces = korvaiCycles(korvai(20, [[0, 1], [1, 5], [4, 5], [19, 20]]), main);
    expect(show(pieces)).toEqual(["M@0/1 M@1/4 K@1/2", "K@0/1", "K@1/2 K@7/8"]);
    expect(pieces.every((p) => p.role === "korvai" && p.name === "K")).toBe(true);
    expect(pieces.every((p) => p.counts.n === 8 && p.counts.d === 1)).toBe(true);
  });

  it("gives a korvai of exactly one cycle the whole cycle, as before", () => {
    expect(show(korvaiCycles(korvai(8, [[0, 1], [1, 2]]), main))).toEqual(["K@0/1 K@1/2"]);
  });

  it("lands a korvai shorter than a cycle on the next sam", () => {
    expect(show(korvaiCycles(korvai(4, [[0, 1], [1, 2]]), main))).toEqual(["M@0/1 M@1/4 K@1/2 K@3/4"]);
  });

  it("lands on a point after sam, the main pattern carrying on from there", () => {
    // One cycle long, landing a quarter in: it starts a quarter into the first cycle.
    expect(show(korvaiCycles(korvai(8, [[0, 1], [1, 2]]), main, r(1, 4)))).toEqual(["M@0/1 K@1/4 K@3/4", "M@1/4 M@1/2 M@3/4"]);
  });
});

describe("a korvai's length", () => {
  it("is free, so Short Rupakam's three-cycle korvai fits it and Adi's doesn't", () => {
    expect(setup({ tala: "custom_rupakam" }).korvai?.id).toBe("rupakam-korvai-1");
    expect(setup({ tala: "custom_rupakam" }).korvai?.counts).toEqual(r(9));
    expect(setup().korvai?.id).toBe("adi-korvai-1");
  });

  it("is free only for a korvai: a main or variation still has to fill the cycle", () => {
    const grid = new TalaGrid(beatsFor({ tala: "custom_adi", jaathi: "chatusram", nadai: "chatusram", kalai: 1 }));
    const long = { ...PATTERNS.find((p) => p.id === "adi-chatusram-2")!, counts: r(16) };
    const main = PATTERNS.find((p) => p.id === "adi-chatusram-1")!;
    expect(arrangementFor(grid, "chatusram", main, [main, long])!.variations).toEqual([]);
  });
});
