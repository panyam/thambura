import { describe, expect, it } from "vitest";
import { generatedPattern } from "./generated";
import type { Fallback } from "./kit";
import { ratio } from "./ratio";
import { beatsFor, type TalaSettings } from "./selection";
import { TalaGrid } from "./talaGrid";

/** What the mridangam kit's manifest names. */
const MRIDANGAM: Fallback = { sam: "L.tham", clap: "L.thom", wave: "R.dhin", count: "R.nam", fill: "R.thi" };

const forTala = (patch: Partial<TalaSettings> = {}, fallback: Fallback = MRIDANGAM) => {
  const settings: TalaSettings = {
    tala: "custom_adi",
    jaathi: "chatusram",
    nadai: "chatusram",
    kalai: 1,
    ...patch,
  };
  const beats = beatsFor(settings);
  const grid = new TalaGrid(beats, settings.kalai);
  return generatedPattern(beats, grid.shape, grid.patternCounts, fallback)!;
};

/** Where each stroke falls, as a fraction of the cycle. */
const at = (p: ReturnType<typeof forTala>) => p.strokes.map((s) => s.at.n / s.at.d);

describe("the generated fallback", () => {
  it("plays one stroke per clap, wave and finger count", () => {
    const adi = forTala();
    // Adi in chatusram: eight beats, one tick each.
    expect(adi.strokes.map((s) => s.stroke)).toEqual([
      "L.tham", // sam
      "R.nam", // one
      "R.nam", // two
      "R.nam", // three
      "L.thom", // the second laghu's clap
      "R.dhin", // its wave
      "L.thom", // clap
      "R.dhin", // wave
    ]);
    expect(at(adi)).toEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
    expect(adi.strokes[0].gain).toBeGreaterThan(1);
  });

  it("fills the nadai's accents between the beats", () => {
    // Thisram strikes at 0 and 1/3 of each akshara, so the drum does too.
    const thisram = forTala({ nadai: "thisram" });
    expect(thisram.strokes).toHaveLength(16);
    expect(at(thisram).slice(0, 4)).toEqual([0, 1 / 24, 0.125, 0.125 + 1 / 24]);
    expect(thisram.strokes.slice(0, 4).map((s) => s.stroke)).toEqual(["L.tham", "R.thi", "R.nam", "R.thi"]);
  });

  it("follows a chaapu's own accents across its one long beat", () => {
    // Misra Chaapu strikes at 0, 1/7, 3/7 and 5/7 of the cycle.
    const misra = forTala({ tala: "chaapu_misram" });
    expect(misra.counts).toEqual(ratio(7, 2));
    expect(at(misra)).toEqual([0, 1 / 7, 3 / 7, 5 / 7]);
    expect(misra.strokes.map((s) => s.stroke)).toEqual(["L.tham", "R.thi", "R.thi", "R.thi"]);
  });

  it("says it is generated, so nobody mistakes it for a pattern someone plays", () => {
    const p = forTala({ tala: "sapta_ata", jaathi: "khandam" });
    expect(p.name).toBe("Generated from the tala");
    expect(p.source).toMatch(/generated/);
    expect(p.strokes.length).toBeGreaterThan(0);
  });

  it("has nothing to play for an empty tala", () => {
    expect(generatedPattern([], "", ratio(0), MRIDANGAM)).toBeNull();
  });

  it("plays whatever strokes the kit names for each role", () => {
    const pot: Fallback = { sam: "P.both", clap: "P.thom", wave: "P.din", count: "P.nam", fill: "P.ki" };
    expect(forTala({}, pot).strokes.map((s) => s.stroke)).toEqual(["P.both", "P.nam", "P.nam", "P.nam", "P.thom", "P.din", "P.thom", "P.din"]);
    expect(forTala({ nadai: "thisram" }, pot).strokes[1].stroke).toBe("P.ki");
  });

  it("has nothing to play for a kit that names no fallback", () => {
    const beats = beatsFor({ tala: "custom_adi", jaathi: "chatusram", nadai: "chatusram", kalai: 1 });
    const grid = new TalaGrid(beats);
    expect(generatedPattern(beats, grid.shape, grid.patternCounts, undefined)).toBeNull();
  });

  it("covers every tala and nadai in the menus", () => {
    const talas: TalaSettings["tala"][] = [
      "sapta_eka",
      "sapta_rupaka",
      "sapta_matya",
      "sapta_jhumpa",
      "sapta_thriputa",
      "sapta_ata",
      "sapta_dhruva",
      "chaapu_thisram",
      "chaapu_khandam",
      "chaapu_misram",
      "chaapu_vilomam",
      "chaapu_sankeernam",
      "custom_adi",
      "custom_rupakam",
    ];
    const gatis: TalaSettings["nadai"][] = ["thisram", "chatusram", "khandam", "misram", "sankeernam"];
    for (const tala of talas) {
      for (const nadai of gatis) {
        const p = forTala({ tala, nadai, jaathi: nadai });
        expect(p.strokes.length, `${tala} in ${nadai}`).toBeGreaterThan(0);
        for (const stroke of p.strokes) {
          const fraction = stroke.at.n / stroke.at.d;
          expect(fraction, `${tala} in ${nadai}`).toBeGreaterThanOrEqual(0);
          expect(fraction, `${tala} in ${nadai}`).toBeLessThan(1);
        }
      }
    }
  });
});
