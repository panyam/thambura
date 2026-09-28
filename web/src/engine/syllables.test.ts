import { describe, expect, it } from "vitest";
import { beatsFor } from "./selection";
import type { Gati } from "./carnatic";
import { COUNTING, countingFor, resolveSyllable, shown, SYLLABLES } from "./syllables";

const said = (ids: string[]) => ids.map(shown).join(" ");

describe("the syllable table", () => {
  it("has one entry per id, and no alias that is also an id or another's alias", () => {
    const ids = SYLLABLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const aliases = SYLLABLES.flatMap((s) => s.aliases);
    expect(new Set(aliases).size).toBe(aliases.length);
    for (const alias of aliases) expect(ids).not.toContain(alias);
  });

  it("resolves an alias to its id, and leaves anything else alone", () => {
    expect(resolveSyllable("ja")).toBe("jo");
    expect(resolveSyllable("dhi")).toBe("di");
    expect(resolveSyllable("dheem")).toBe("dim");
    expect(resolveSyllable("ṭa")).toBe("ta");
    expect(resolveSyllable("Dhin")).toBe("din");
    expect(resolveSyllable("jo")).toBe("jo");
    expect(resolveSyllable("xyz")).toBeNull();
  });

  it("keeps apart what the design holds apart", () => {
    expect(resolveSyllable("dhom")).toBe("dhom");
    expect(resolveSyllable("thom")).toBe("thom");
    expect(resolveSyllable("tha")).toBe("tha");
    expect(resolveSyllable("tang")).toBe("tang");
  });
});

describe("counting syllables", () => {
  it("uses only syllables the table knows, as many as the gati counts", () => {
    const lengths: Record<Gati, number> = { thisram: 3, chatusram: 4, khandam: 5, misram: 7, vilomam: 7, sankeernam: 9 };
    for (const [gati, ids] of Object.entries(COUNTING) as [Gati, string[]][]) {
      expect(ids, gati).toHaveLength(lengths[gati]);
      for (const id of ids) expect(SYLLABLES.map((s) => s.id), `${gati}: ${id}`).toContain(id);
    }
  });

  it("says them the way the design settled", () => {
    expect(said(COUNTING.thisram)).toBe("ta ki ta");
    expect(said(COUNTING.chatusram)).toBe("ta ka di mi");
    expect(said(COUNTING.khandam)).toBe("ta ka ta ki ta");
    expect(said(COUNTING.misram)).toBe("ta ki ta ta ka di mi");
    expect(said(COUNTING.vilomam)).toBe("ta ka di mi ta ki ta");
    expect(said(COUNTING.sankeernam)).toBe("ta ka di mi ta ka ta ki ta");
  });

  it("gives Adi in chatusram the nadai's four in each of its eight aksharas", () => {
    const settings = { tala: "custom_adi", jaathi: "chatusram", nadai: "chatusram", kalai: 1 } as const;
    const counting = countingFor(settings, beatsFor(settings));
    expect(counting).toHaveLength(32);
    expect(said(counting.slice(0, 8).map((c) => c.syllable))).toBe("ta ka di mi ta ka di mi");
    expect(counting[5].at).toEqual({ n: 5, d: 32 });
  });

  it("follows the nadai, not the jaathi, in a sapta tala", () => {
    const settings = { tala: "sapta_eka", jaathi: "chatusram", nadai: "khandam", kalai: 1 } as const;
    const counting = countingFor(settings, beatsFor(settings));
    expect(counting).toHaveLength(20);
    expect(said(counting.slice(0, 5).map((c) => c.syllable))).toBe("ta ka ta ki ta");
  });

  it("counts a chaapu by its own gati across the one beat, whatever the nadai says", () => {
    const misra = { tala: "chaapu_misram", jaathi: "chatusram", nadai: "thisram", kalai: 1 } as const;
    const counting = countingFor(misra, beatsFor(misra));
    expect(said(counting.map((c) => c.syllable))).toBe("ta ki ta ta ka di mi");
    expect(counting[3].at).toEqual({ n: 3, d: 7 });

    const vilomam = { ...misra, tala: "chaapu_vilomam" } as const;
    expect(said(countingFor(vilomam, beatsFor(vilomam)).map((c) => c.syllable))).toBe("ta ka di mi ta ki ta");
  });

  it("ignores kalai, since a pattern and its lane do", () => {
    const one = { tala: "custom_adi", jaathi: "chatusram", nadai: "chatusram", kalai: 1 } as const;
    const two = { ...one, kalai: 2 };
    expect(countingFor(two, beatsFor(two))).toEqual(countingFor(one, beatsFor(one)));
  });
});
