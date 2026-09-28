import { describe, expect, it } from "vitest";
import { laneFor } from "./lane";
import { PATTERNS, type Pattern } from "./patterns";
import { generatedPattern } from "./generated";
import { beatsFor, type TalaSettings } from "./selection";
import { countingFor } from "./syllables";
import { TalaGrid } from "./talaGrid";
import { ratio } from "./ratio";

const pattern = (id: string) => PATTERNS.find((p) => p.id === id)!;
const counting = (settings: TalaSettings) => countingFor(settings, beatsFor(settings));
const ADI: TalaSettings = { tala: "custom_adi", jaathi: "chatusram", nadai: "chatusram", kalai: 1 };
const MISRA_CHAAPU: TalaSettings = { tala: "chaapu_misram", jaathi: "chatusram", nadai: "chatusram", kalai: 1 };

describe("laneFor", () => {
  it("is null without a pattern", () => {
    expect(laneFor(null, counting(ADI))).toBeNull();
  });

  it("splits Adi's aksharas into the nadai's four slots, a syllable in each", () => {
    const lane = laneFor(pattern("adi-chatusram-1"), counting(ADI))!;
    expect(lane.aksharas).toBe(8);
    expect(lane.columns).toBe(4);
    expect(lane.counting.filter((c) => c.akshara === 0).map((c) => [c.syllable, c.column])).toEqual([
      ["ta", 0],
      ["ka", 1],
      ["di", 2],
      ["mi", 3],
    ]);
  });

  it("puts a stroke in the column it falls in", () => {
    const toy: Pattern = { ...pattern("adi-chatusram-1"), strokes: [{ at: ratio(1, 32), stroke: "R.thi", gain: 1 }] };
    expect(laneFor(toy, counting(ADI))!.strokes).toEqual([{ stroke: "R.thi", akshara: 0, column: 1 }]);
  });

  it("gives a written misra chaapu one syllable per akshara, and halves for its strokes", () => {
    const lane = laneFor(pattern("misra-chaapu-1"), counting(MISRA_CHAAPU))!;
    expect(lane.aksharas).toBe(7);
    expect(lane.columns).toBe(2);
    expect(lane.counting.map((c) => c.syllable).join(" ")).toBe("ta ki ta ta ka di mi");
    expect(lane.counting.every((c) => c.column === 0)).toBe(true);
    expect(lane.counting.map((c) => c.akshara)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("gives a generated chaapu, one cell for the whole beat, the seven syllables inside it", () => {
    const beats = beatsFor(MISRA_CHAAPU);
    const grid = new TalaGrid(beats);
    const lane = laneFor(generatedPattern(beats, grid.shape, grid.patternCounts), counting(MISRA_CHAAPU))!;
    expect(lane.aksharas).toBe(1);
    expect(lane.columns).toBe(7);
    expect(lane.counting.map((c) => c.column)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("gives a sankeernam nadai nine slots", () => {
    const settings: TalaSettings = { tala: "sapta_thriputa", jaathi: "chatusram", nadai: "sankeernam", kalai: 1 };
    const beats = beatsFor(settings);
    const grid = new TalaGrid(beats);
    const lane = laneFor(generatedPattern(beats, grid.shape, grid.patternCounts), counting(settings))!;
    expect(lane.columns).toBe(9);
    expect(lane.counting.filter((c) => c.akshara === 0).map((c) => c.syllable).join(" ")).toBe("ta ka di mi ta ka ta ki ta");
  });

  it("still lays out the strokes with no counting line", () => {
    const lane = laneFor(pattern("adi-chatusram-1"), [])!;
    expect(lane.counting).toEqual([]);
    expect(lane.strokes.length).toBe(pattern("adi-chatusram-1").strokes.length);
  });
});
