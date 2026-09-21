import { describe, expect, it } from "vitest";
import { arrangementFor, patternForCycle, type Arrangement } from "./arrangement";
import { PATTERNS, patternFor, type Pattern } from "./patterns";
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

  it("has no alternates where nobody has written any", () => {
    expect(setup({ tala: "chaapu_khandam" }).variations).toEqual([]);
    expect(setup({ tala: "custom_rupakam" }).variations).toEqual([]);
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
    expect(setup({ tala: "chaapu_misram" }).korvai).toBeNull();
    expect(setup({ tala: "custom_rupakam" }).korvai).toBeNull();
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
    const khanda = setup({ tala: "chaapu_khandam" });
    expect(patternForCycle(khanda, 3, "lots", draws([0])).id).toBe("khanda-chaapu-1");
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
