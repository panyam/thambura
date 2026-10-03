import type { Gati } from "./carnatic";
import { fitsGrid, PATTERNS, type Pattern } from "./patterns";
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
   * A korvai fills whole cycles and resolves on the next sam, which is how
   * an accompanist tells a singer the section is over.
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
