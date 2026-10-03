import { describe, expect, it } from "vitest";
import { compilePattern } from "./patterns.mjs";
import { phraseTable } from "./realize.mjs";
import STROKES from "../patterns/strokes.json";

const SYLLABLES = ["ta", "ka", "din", "na", "ki", "thom", "lang"].map((id) => ({ id, aliases: id === "din" ? ["dhin"] : [] }));
const LETTERS = { k: "R.thi", o: "L.thom", od: "L.dheem", n: "R.nam", p: { stroke: "R.thi", gain: 0.6, standIn: "the left-hand tha" } };
const TABLES = {
  words: {
    thom: "L.thom",
    tham: "L.tham",
    thi: "R.thi",
    nam: "R.nam",
    "thom+dhin": "L.dheem",
    tha: { stroke: "L.thom", gain: 0.8, standIn: "the left-hand tha" },
    "tha+num": { stroke: "L.tham", gain: 1, standIn: "the left-hand tha" },
  },
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

  it("needs a chaapu's ticks, since its nadai can't tell it from another of the same length", () => {
    const chaapu = (ticks) => pattern("mrid: tham , thi , nam , thi ,", `nadai: any\n${ticks}`).replace("nadai: chatusram\n", "");
    expect(() => compile(chaapu(""))).toThrow(/t\.not: no ticks in the front matter/);
    expect(compile(chaapu('ticks: "0 2/14 3/7"\n')).ticks).toBe("0 1/7 3/7");
    expect(compile(pattern("mrid: tham , thi , nam , thi ,")).ticks).toBeUndefined();
  });

  it("refuses a role it doesn't know", () => {
    expect(() => compile(pattern("konnakol: ta ka din na ta ka din na"))).toThrow(/t\.not: unknown role "konnakol"/);
  });

  it("marks a mrid: word that's a stand-in, its gain scaled by the accent", () => {
    const p = compile(pattern('mrid: "tha+num" , , , tha , , ,', "accents:\n  0: 1.1\n"));
    expect(p.strokes[0]).toMatchObject({ stroke: "L.tham", gain: 1.1, standIn: true });
    expect(p.strokes[1]).toMatchObject({ stroke: "L.thom", gain: 0.8, standIn: true });
    expect(compile(pattern("mrid: tham , , , tham , , ,")).strokes[0].standIn).toBeUndefined();
  });

  it("reads a quoted name with a + as one word, and ignores case", () => {
    expect(at(compile(pattern('mrid: "thom+dhin" , , , Tham , "Tha+Num" ,')))).toEqual(["L.dheem@0/8", "L.tham@4/8", "L.tham@6/8"]);
  });

  it("plays a pair with no entry of its own as its two strokes at once, each softer", () => {
    const p = compile(pattern('mrid: "thom+thi" , , , tham , , ,', "accents:\n  0: 1.1\n"));
    expect(at(p)).toEqual(["L.thom@0/8", "R.thi@0/8", "L.tham@4/8"]);
    expect(p.strokes.map((s) => s.gain)).toEqual([0.77, 0.77, 1]);
  });

  it("keeps a pair's own entry, a stroke recorded as one", () => {
    expect(at(compile(pattern('mrid: "thom+dhin" , , , "Tha+Num" , , ,')))).toEqual(["L.dheem@0/8", "L.tham@4/8"]);
  });

  it("marks a pair's stand-in part, and only that part", () => {
    const [tha, thi] = compile(pattern('mrid: "tha+thi" , , , tham , , ,')).strokes;
    expect(tha).toMatchObject({ stroke: "L.thom", gain: 0.56, standIn: true });
    expect(thi.standIn).toBeUndefined();
  });

  it("names the part of a pair it doesn't know, and an unknown word", () => {
    expect(() => compile(pattern('mrid: "thom+zap" , , , tham , , ,'))).toThrow(/t\.not: no stroke for "zap" in "thom\+zap"/);
    expect(() => compile(pattern("mrid: bang , , , tham , , ,"))).toThrow(/t\.not: no stroke for "bang"/);
  });

  it("refuses a pair on one head, where the second would choke the first", () => {
    expect(() => compile(pattern('mrid: "thi+nam" , , , tham , , ,'))).toThrow(/t\.not: "thi\+nam" plays two strokes on one head/);
  });

  it("names the file and the akshara of a phrase it can't realize", () => {
    expect(() => compile(pattern("sol: ta ka din na ki , , ,"))).toThrow(/t\.not, akshara 2: no realization for "ki"/);
  });
});

describe("the stroke tables", () => {
  const standIn = (e) => typeof e === "object" && e.standIn;
  it("play the left-hand tha as thom, a stand-in, in words and in letters", () => {
    expect(STROKES.strokes.tha).toMatchObject({ stroke: "L.thom" });
    expect(STROKES.letters.p).toMatchObject({ stroke: "L.thom" });
    expect(standIn(STROKES.strokes.tha) && standIn(STROKES.letters.p)).toBeTruthy();
    expect(STROKES.strokes["tha+num"]).toMatchObject({ stroke: "L.tham" });
    expect(STROKES.strokes["tha+dhin"]).toMatchObject({ stroke: "L.dheem" });
  });

  it("use the source's names: dheem is the right hand's, thom with din is \"thom+dhin\"", () => {
    expect(STROKES.strokes.dheem).toBe("R.dheem");
    expect(STROKES.strokes["thom+dhin"]).toBe("L.dheem");
    expect(STROKES.strokes["thom+num"]).toBe("L.tham");
    expect([STROKES.strokes.num, STROKES.strokes.dhi, STROKES.strokes.cha]).toEqual(["R.nam", "R.thi", "R.chapu"]);
  });

  it("keep every key lowercase, since a token is looked up lowercased", () => {
    for (const key of Object.keys(STROKES.strokes)) expect(key).toBe(key.toLowerCase());
  });
});
