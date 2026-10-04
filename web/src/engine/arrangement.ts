import type { Gati } from "./carnatic";
import { fitsGrid, PATTERNS, type Pattern, type PatternStroke } from "./patterns";
import { add, cmp, mul, ratio, ZERO, type Ratio } from "./ratio";
import type { TalaGrid } from "./talaGrid";

/**
 * What plays each cycle.
 *
 * A mridangist doesn't repeat one cycle for twenty minutes, and the loudest
 * complaint about every app we looked at was exactly that. So an arrangement
 * holds the pattern that plays most cycles and the alternates to swap in, and
 * decides per cycle which one it is.
 *
 * The decision is made from the cycle number and a random draw, so it is
 * repeatable under a seeded rng and testable without playing anything.
 * Korvais, fills and eduppu come later; this is the part that stops the loop
 * being the same eight beats forever.
 */

export interface Arrangement {
  /** The pattern that plays when nothing else is chosen. */
  main: Pattern;
  /** Alternates of the same cycle, or empty when nobody has written any. */
  variations: Pattern[];
  /**
   * An ending that lands on sam, played once when the student asks for it.
   * It's as long as it is: `korvaiCycles` works out where it starts so it
   * resolves on sam, which is how an accompanist tells a singer the section
   * is over.
   */
  korvai: Pattern | null;
}

/** How often a variation is swapped in: none, now and then, or often. */
export type Variety = "off" | "some" | "lots";

export const VARIETY_OPTIONS: { value: Variety; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "some", label: "Some" },
  { value: "lots", label: "Lots" },
];

/** The chance a cycle takes a variation rather than the main pattern. */
const CHANCE: Record<Variety, number> = { off: 0, some: 0.3, lots: 0.7 };

/** Every pattern written for this tala: the main one, and its alternates. */
export function arrangementFor(
  grid: TalaGrid,
  nadai: Gati,
  main: Pattern | null,
  from: Pattern[] = PATTERNS,
): Arrangement | null {
  if (!main) return null;
  const fits = (p: Pattern) => fitsGrid(p, grid, nadai);
  return {
    main,
    variations: from.filter((p) => p.role === "variation" && fits(p)),
    korvai: from.find((p) => p.role === "korvai" && fits(p)) ?? null,
  };
}

/**
 * The pattern for a cycle. The first cycle is always the main one, so a
 * listener hears what the tala's accompaniment is before it starts varying.
 */
export function patternForCycle(
  arrangement: Arrangement,
  cycle: number,
  variety: Variety,
  rng: () => number,
): Pattern {
  const { main, variations } = arrangement;
  if (cycle === 0 || variations.length === 0 || CHANCE[variety] === 0) return main;
  if (rng() >= CHANCE[variety]) return main;
  const pick = Math.min(variations.length - 1, Math.floor(rng() * variations.length));
  return variations[pick];
}

/**
 * A korvai cut into one pattern per cycle it plays in, so the stroke
 * sequencer, which asks for a cycle at a time, can play one of any length.
 *
 * It ends on `landing` (a fraction of the cycle: 0 is sam, and an eduppu
 * would be later), so it starts wherever that puts it: two and a half cycles
 * long, it starts halfway into the first of three. The first cycle plays
 * `main` up to there. When it lands after sam, the last cycle plays `main`
 * again from the landing point. Each piece keeps `main`'s length and akshara
 * count, so the lane and the sequencer treat it as any other cycle, and the
 * korvai's name and role, so the lane says what is playing.
 */
export function korvaiCycles(korvai: Pattern, main: Pattern, landing: Ratio = ZERO): Pattern[] {
  // Everything below is in cycles from the start of the first piece.
  const length = div(korvai.counts, main.counts);
  const cycles = Math.max(0, ceil(sub(length, landing)));
  const end = add(ratio(cycles), landing);
  const start = sub(end, length);
  const pieces = Math.max(1, ceil(end));
  const out: PatternStroke[][] = Array.from({ length: pieces }, () => []);
  const put = (at: Ratio, stroke: PatternStroke) => {
    const cycle = floor(at);
    if (cycle >= 0 && cycle < pieces) out[cycle].push({ ...stroke, at: sub(at, ratio(cycle)) });
  };
  for (let cycle = 0; cycle < pieces; cycle++) {
    for (const s of main.strokes) {
      const at = add(ratio(cycle), s.at);
      if (cmp(at, start) < 0 || cmp(at, end) >= 0) put(at, s);
    }
  }
  for (const s of korvai.strokes) put(add(start, mul(s.at, length)), s);
  return out.map((strokes) => ({
    ...main,
    id: korvai.id,
    name: korvai.name,
    source: korvai.source,
    role: "korvai",
    strokes: strokes.sort((a, b) => cmp(a.at, b.at)),
  }));
}

const sub = (a: Ratio, b: Ratio) => add(a, mul(b, ratio(-1)));
const div = (a: Ratio, b: Ratio) => mul(a, ratio(b.d, b.n));
const floor = (a: Ratio) => Math.floor(a.n / a.d);
const ceil = (a: Ratio) => Math.ceil(a.n / a.d);
