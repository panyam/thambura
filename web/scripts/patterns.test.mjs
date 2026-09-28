import { describe, expect, it } from "vitest";
import { compilePattern } from "./patterns.mjs";
import { phraseTable } from "./realize.mjs";

const SYLLABLES = ["ta", "ka", "din", "na", "ki", "thom", "lang"].map((id) => ({ id, aliases: id === "din" ? ["dhin"] : [] }));
const LETTERS = { k: "R.thi", o: "L.thom", od: "L.dheem", n: "R.nam", p: { stroke: "R.thi", gain: 0.6, standIn: "the left-hand tha" } };
const TABLES = {
  words: { tham: "L.tham", thi: "R.thi", nam: "R.nam" },
  letters: LETTERS,
  syllables: SYLLABLES,
  table: phraseTable({ "ta ka din na": "k o o k", "ta ka": "k p", ta: "k", thom: "o" }, { syllables: SYLLABLES, letters: LETTERS }),
};

const pattern = (body, meta = "") => `---
id: t
name: Test
counts: 2
shape: down down
nadai: chatusram
source: a test
${meta}---
\\cycle("|2|")
\\beatDuration(4)
${body}
`;
const compile = (text) => compilePattern(text, "t.not", TABLES);
const at = (p) => p.strokes.map((s) => `${s.stroke}@${s.n}/${s.d}`);

describe("compilePattern", () => {
  it("realizes a sol: line into strokes where its syllables fall", () => {
    const p = compile(pattern("sol: ta ka din na ta ka din na"));
    expect(at(p).slice(0, 4)).toEqual(["R.thi@0/8", "L.thom@1/8", "L.thom@2/8", "R.thi@3/8"]);
    expect(p.strokes).toHaveLength(8);
    expect(p.solkattu.slice(0, 4)).toEqual([
      { n: 0, d: 8, syllable: "ta" },
      { n: 1, d: 8, syllable: "ka" },
      { n: 2, d: 8, syllable: "din" },
      { n: 3, d: 8, syllable: "na" },
    ]);
  });

  it("keeps rests as silence and marks a stand-in", () => {
    const p = compile(pattern("sol: ta ka , , thom , , ,"));
    expect(at(p)).toEqual(["R.thi@0/8", "R.thi@1/8", "L.thom@4/8"]);
    expect(p.strokes[1]).toMatchObject({ gain: 0.6, standIn: true });
    expect(p.strokes[0].standIn).toBeUndefined();
  });

  it("takes a pattern's own phrases over the table", () => {
    const p = compile(pattern("sol: ta ka din na ta ka din na", "realize:\n  ta ka din na: n o o k\n"));
    expect(p.strokes[0].stroke).toBe("R.nam");
  });

  it("scales a stand-in's gain by the akshara's accent", () => {
    const p = compile(pattern("sol: ta ka , , thom , , ,", "accents:\n  0: 1.1\n"));
    expect(p.strokes[1].gain).toBeCloseTo(0.66, 10);
  });

  it("plays a mrid: line as written and keeps a sol: line beside it to show", () => {
    const p = compile(pattern("sol: ta ka din na ta ka din na\nmrid: tham , thi , nam , thi ,"));
    expect(at(p)).toEqual(["L.tham@0/8", "R.thi@2/8", "R.nam@4/8", "R.thi@6/8"]);
    expect(p.solkattu).toHaveLength(8);
  });

  it("leaves solkattu out of a pattern with no sol: line", () => {
    expect(compile(pattern("mrid: tham , thi , nam , thi ,")).solkattu).toBeUndefined();
  });

  it("refuses a sol: line that doesn't fill the cycle its mrid: line does", () => {
    expect(() => compile(pattern("sol: ta ka din na\nmrid: tham , thi , nam , thi ,"))).toThrow(/t\.not: the sol: line fills 1 beats, but its cycle is 2/);
  });

  it("refuses a role it doesn't know", () => {
    expect(() => compile(pattern("konnakol: ta ka din na ta ka din na"))).toThrow(/t\.not: unknown role "konnakol"/);
  });

  it("names the file and the akshara of a phrase it can't realize", () => {
    expect(() => compile(pattern("sol: ta ka din na ki , , ,"))).toThrow(/t\.not, akshara 2: no realization for "ki"/);
  });
});
