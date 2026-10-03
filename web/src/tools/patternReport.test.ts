import { describe, expect, it } from "vitest";
import type { Pattern } from "../engine/patterns";
import { ratio } from "../engine/ratio";
import { beatsFor, DEFAULT_SETTINGS, TALA_OPTIONS, type TalaSettings } from "../engine/selection";
import { TalaGrid } from "../engine/talaGrid";
import { formatReport, patternReport, REPORT_SCOPE } from "./patternReport";

const misra: TalaSettings = { ...DEFAULT_SETTINGS, tala: "chaapu_misram" };
const khanda: TalaSettings = { ...DEFAULT_SETTINGS, tala: "chaapu_khandam" };

function toy(settings: TalaSettings, id: string, role: Pattern["role"], standIns = 0): Pattern {
  const grid = new TalaGrid(beatsFor(settings));
  return {
    id,
    name: id,
    source: `Made up for a test, by nobody. Unverified.`,
    shape: grid.shape,
    counts: grid.patternCounts,
    beats: grid.beats.length,
    aksharas: grid.beats.length,
    nadai: "any",
    role,
    strokes: [0, 1, 2].map((i) => ({ at: ratio(i, 3), stroke: "R.thi", gain: 1, ...(i < standIns ? { standIn: true as const } : {}) })),
  };
}

describe("patternReport", () => {
  it("names the main pattern, or says the skeleton plays", () => {
    const rows = patternReport([misra, khanda], [toy(misra, "misra-main", "main")]);
    expect(rows.map((r) => [r.tala, r.main])).toEqual([
      ["Misra Chaapu", "misra-main"],
      ["Khanda Chaapu", null],
    ]);
    expect(rows[0].source).toBe("Made up for a test, by nobody");
  });

  it("counts only the variations and korvai that fit the tala", () => {
    // Both chaapus are the shape "down"; only their length tells them apart.
    const rows = patternReport(
      [misra, khanda],
      [toy(misra, "m", "main"), toy(misra, "m2", "variation"), toy(misra, "m3", "variation"), toy(khanda, "k", "main"), toy(khanda, "k2", "korvai")],
    );
    expect(rows.map((r) => [r.variations, r.korvai])).toEqual([
      [2, false],
      [0, true],
    ]);
  });

  it("counts the main pattern's stand-in strokes", () => {
    expect(patternReport([misra], [toy(misra, "m", "main", 2)])[0].standIns).toBe(2);
  });

  it("says which talas the compiled patterns cover", () => {
    // Update this when a pattern lands: it's the mission's progress (#185).
    expect(patternReport().filter((r) => r.main).map((r) => [r.tala, r.main])).toEqual([
      ["Thriputa (Chathusram)", "adi-chatusram-1"],
      ["Khanda Chaapu", "khanda-chaapu-1"],
      ["Misra Chaapu", "misra-chaapu-1"],
      ["Adi", "adi-chatusram-1"],
      ["Short Rupakam", "rupakam-chatusram-1"],
    ]);
  });

  it("covers each menu tala, once per jaathi", () => {
    const menu = TALA_OPTIONS.flatMap((g) => g.options.map((o) => o.value));
    expect(REPORT_SCOPE.every((s) => menu.includes(s.tala))).toBe(true);
    expect(new Set(menu)).toEqual(new Set(REPORT_SCOPE.map((s) => s.tala)));
    const keys = REPORT_SCOPE.map((s) => `${s.tala}/${s.jaathi}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("formatReport", () => {
  it("lines the columns up, counts the written rows and lists the sources", () => {
    const text = formatReport(patternReport([misra, khanda], [toy(misra, "misra-main", "main")]));
    expect(text).toBe(
      [
        "Tala           Plays       Stand-ins  Variations  Korvai",
        "-------------  ----------  ---------  ----------  ------",
        "Misra Chaapu   misra-main  0          0           no",
        "Khanda Chaapu  generated   -          -           -",
        "",
        "1 of 2 written",
        "",
        "Sources:",
        "  misra-main: Made up for a test, by nobody",
      ].join("\n"),
    );
  });
});
