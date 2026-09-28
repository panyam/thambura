import { describe, expect, it } from "vitest";
import { phraseTable, realize } from "./realize.mjs";

const SYLLABLES = [
  { id: "ta", aliases: [] },
  { id: "ka", aliases: [] },
  { id: "din", aliases: ["dhin"] },
  { id: "na", aliases: [] },
  { id: "gin", aliases: [] },
  { id: "thom", aliases: [] },
  { id: "lang", aliases: [] },
  { id: "ga", aliases: [] },
];
const LETTERS = {
  k: "R.thi",
  t: "R.ta",
  n: "R.nam",
  o: "L.thom",
  od: "L.dheem",
  p: { stroke: "R.thi", gain: 0.6, standIn: "the left-hand tha" },
  u: { stroke: "R.chapu", gain: 0.7, standIn: "arai chapu" },
};
const table = (phrases) => phraseTable(phrases, { syllables: SYLLABLES, letters: LETTERS });
const TABLE = table({ ta: "k", din: "od", thom: "o", "ta ka": "k p", "ta din gin na thom": "k t k n o", lang: "u" });
const played = (out) => out.strokes.map((s) => (s ? s.stroke : "_")).join(" ");

describe("phraseTable", () => {
  it("rejects a phrase whose strokes don't match it in length", () => {
    expect(() => table({ "ta ka": "k" })).toThrow(/"ta ka".*2 syllables.*1 stroke/);
  });

  it("rejects a syllable or a letter it doesn't know", () => {
    expect(() => table({ "ta xa": "k k" })).toThrow(/unknown syllable "xa"/);
    expect(() => table({ ta: "q" })).toThrow(/unknown letter "q"/);
  });

  it("files a phrase written with an alias under its id", () => {
    expect(realize(["din"], { table: table({ dhin: "od" }) }).strokes[0].stroke).toBe("L.dheem");
  });
});

describe("realize", () => {
  it("takes the longest phrase that matches", () => {
    expect(played(realize(["ta", "din", "gin", "na", "thom"], { table: TABLE }))).toBe("R.thi R.ta R.thi R.nam L.thom");
    expect(played(realize(["ta", "din"], { table: TABLE }))).toBe("R.thi L.dheem");
  });

  it("lets a pattern's own choice beat the table", () => {
    const overrides = table({ "ta ka": "p k" });
    expect(played(realize(["ta", "ka"], { table: TABLE, overrides }))).toBe("R.thi R.thi");
    expect(realize(["ta", "ka"], { table: TABLE, overrides }).strokes[0].standIn).toBe("the left-hand tha");
  });

  it("reads a spelling through its alias, and gives back ids", () => {
    const out = realize(["ta", "dhin"], { table: TABLE });
    expect(out.syllables).toEqual(["ta", "din"]);
    expect(played(out)).toBe("R.thi L.dheem");
  });

  it("lets a rest through, and matches one written into a phrase", () => {
    expect(played(realize(["ta", null, "thom"], { table: TABLE }))).toBe("R.thi _ L.thom");
    const withGap = table({ "din _ ga": "od _ p" });
    expect(played(realize(["din", null, "ga"], { table: withGap }))).toBe("L.dheem _ R.thi");
  });

  it("plays a stand-in at its gain, and says so", () => {
    const out = realize(["ta", "ka", "lang"], { table: TABLE });
    expect(out.strokes[1]).toEqual({ stroke: "R.thi", gain: 0.6, standIn: "the left-hand tha" });
    expect(out.strokes[2]).toEqual({ stroke: "R.chapu", gain: 0.7, standIn: "arai chapu" });
    expect(out.strokes[0]).toEqual({ stroke: "R.thi", gain: 1 });
  });

  it("names the phrase it can't realize, and where", () => {
    expect(() => realize(["ta", "din", "na"], { table: TABLE })).toThrow(/no realization for "na" at syllable 3/);
    expect(() => realize(["ta", "xa"], { table: TABLE })).toThrow(/unknown syllable "xa" at syllable 2/);
  });
});
