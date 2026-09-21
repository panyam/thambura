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
  /** The nadai it is written for, or "any" when the tala has none. */
  nadai: Gati | "any";
  strokes: PatternStroke[];
}


/**
 * The pattern for a tala, or null when none fits. A pattern matches on the
 * cycle's shape and the nadai, so the Adi sarvalaghu serves both Adi and a
 * chatusra-jaathi Thriputa, which are the same eight beats played the same
 * way, and not Matya in thisram, which is eight beats of a different shape.
 * A chaapu is one long beat rather than even aksharas, so nothing fits it yet.
 */
export function patternFor(grid: TalaGrid, nadai: Gati, from: Pattern[] = PATTERNS): Pattern | null {
  // A chaapu is one beat whatever the nadai says, so its patterns say "any".
  return (
    from.find(
      (p) =>
        p.shape === grid.shape &&
        cmp(p.counts, grid.patternCounts) === 0 &&
        (p.nadai === nadai || p.nadai === "any"),
    ) ?? null
  );
}

/** Where a pattern's stroke falls in counts, given how long the cycle lasts. */
export function strokeCount(stroke: PatternStroke, cycleCounts: Ratio): Ratio {
  return mul(stroke.at, cycleCounts);
}
