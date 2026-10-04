import type { Gati } from "./carnatic";
import { cmp, mul, type Ratio } from "./ratio";
import { PATTERNS } from "./patterns.data";

export { PATTERNS };
import type { TalaGrid } from "./talaGrid";

/**
 * The patterns a mridangam plays, and how one is matched to a tala.
 *
 * A pattern is written in aksharas, not seconds: a stroke sits at akshara 3
 * and three quarters of the way through it, and the tempo map turns that into
 * a time when it's pulled. So a pattern stretches with kalai and follows a
 * tempo change without knowing either happened.
 *
 * The patterns themselves live in `web/patterns/*.not`, written in the
 * notations DSL (panyam/notations), and `scripts/compile-patterns.mjs` turns
 * them into `patterns.data.ts` at build time. The parser stays out of the
 * browser: it bundles to 78 KB gzipped, and compiling early turns a
 * miscounted pattern into a build failure rather than a silence.
 */

/** One stroke in a pattern. */
export interface PatternStroke {
  /**
   * Where it falls, as a fraction of the cycle: 0 is sam, 1/2 is halfway.
   * Fractions of the whole cycle rather than of a beat, because a chaapu is
   * one long beat in our tables while its pattern is written per akshara.
   */
  at: Ratio;
  /** A stroke id from the kit, such as `R.chapu`. */
  stroke: string;
  /** Louder for an accent, softer for a filler. 1 is a normal stroke. */
  gain: number;
  /**
   * Set when the stroke the pattern asks for isn't in the kit and this one
   * plays in its place (the left-hand tha as a soft ki, say), so a view can
   * say so. patterns/strokes.json's letters decide which.
   */
  standIn?: true;
}

export interface Pattern {
  id: string;
  name: string;
  /**
   * Where the pattern came from, and whether anyone who plays has checked it:
   * "transcribed by <name>", "generated from the tala's angas", or an honest
   * "drafted, unverified". A student can't tell a guess from a tradition by
   * ear, so every pattern says which it is.
   */
  source: string;
  /** The cycle it fits, as `TalaGrid.shape` writes one. */
  shape: string;
  /**
   * How many counts that cycle lasts. Both chaapus are one clap, so they
   * share a shape and only their length tells them apart.
   */
  counts: Ratio;
  /** How many beats that is, ignoring kalai. */
  beats: number;
  /**
   * How many aksharas the pattern is written in, which is how the stroke lane
   * divides a cycle. A chaapu has one beat but seven or five aksharas.
   */
  aksharas: number;
  /**
   * The tala's ticks, as `TalaGrid.ticks` writes them, for a pattern whose
   * nadai is "any". Two chaapus can share a shape and a length (Misra and
   * Viloma are both one beat of seven counts), so a chaapu's pattern names
   * where its claps fall. Absent for a pattern with a nadai, where the shape,
   * length and nadai already decide that.
   */
  ticks?: string;
  /** The nadai it is written for, or "any" when the tala has none. */
  nadai: Gati | "any";
  /**
   * What it is in an arrangement: the one that plays most cycles, an
   * alternate to swap in now and then, or an ending that lands on sam.
   */
  role: "main" | "variation" | "korvai";
  strokes: PatternStroke[];
  /**
   * The solkattu, for a pattern written with a sol: line: each syllable's id
   * (engine/syllables.ts) where it is said, as a fraction of the cycle like
   * the strokes. Absent for a pattern written in strokes alone.
   */
  solkattu?: { at: Ratio; syllable: string }[];
}


/**
 * Whether a pattern fits a tala: the same cycle shape and length (a korvai's
 * length is free), and the
 * same nadai, or for a chaapu's pattern ("any" nadai) the same ticks. The
 * shape matters because counting alone confuses talas that share a length:
 * the Adi sarvalaghu serves both Adi and a chatusra-jaathi Thriputa, which
 * are the same eight beats played the same way, and not Matya in thisram,
 * which is eight beats of a different shape. `patternFor` and the
 * arrangement both match through this, so they can't disagree.
 */
export function fitsGrid(p: Pattern, grid: TalaGrid, nadai: Gati): boolean {
  return (
    p.shape === grid.shape &&
    // A korvai is as long as it is (see korvaiCycles); the rest fill the cycle.
    (p.role === "korvai" || cmp(p.counts, grid.patternCounts) === 0) &&
    (p.nadai === nadai || p.nadai === "any") &&
    (p.ticks === undefined || p.ticks === grid.ticks)
  );
}

/** The main pattern for a tala, or null when none fits (see `fitsGrid`). */
export function patternFor(grid: TalaGrid, nadai: Gati, from: Pattern[] = PATTERNS): Pattern | null {
  // Only the pattern that plays most cycles; the alternates are the
  // arrangement's business (see arrangement.ts).
  return from.find((p) => p.role === "main" && fitsGrid(p, grid, nadai)) ?? null;
}

/** Where a pattern's stroke falls in counts, given how long the cycle lasts. */
export function strokeCount(stroke: PatternStroke, cycleCounts: Ratio): Ratio {
  return mul(stroke.at, cycleCounts);
}
