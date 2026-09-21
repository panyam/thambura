import type { Gati } from "./carnatic";
import { mul, type Ratio } from "./ratio";
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
  /** Where it falls, in aksharas from the start of the cycle. */
  at: Ratio;
  /** A stroke id from the kit, such as `R.chapu`. */
  stroke: string;
  /** Louder for an accent, softer for a filler. 1 is a normal stroke. */
  gain: number;
}

export interface Pattern {
  id: string;
  name: string;
  /** The cycle it fits, as `TalaGrid.shape` writes one. */
  shape: string;
  /** How many beats that is, ignoring kalai. */
  beats: number;
  /** The nadai it is written for. */
  nadai: Gati;
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
  if (!grid.uniform) return null;
  return from.find((p) => p.shape === grid.shape && p.nadai === nadai) ?? null;
}

/** Where a pattern's stroke falls in counts, given how long one beat lasts. */
export function strokeCount(stroke: PatternStroke, countsPerBeat: Ratio): Ratio {
  return mul(stroke.at, countsPerBeat);
}
