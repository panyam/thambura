import type { Beat } from "./beat";
import type { Fallback } from "./kit";
import { add, mul, ratio, ZERO, type Ratio } from "./ratio";
import type { Pattern, PatternStroke } from "./patterns";

/**
 * A plain accompaniment worked out from the tala itself, for the talas nobody
 * has written a pattern for.
 *
 * It plays where the tala's own claps play: every tick of every beat, which
 * for a sapta tala is the nadai's accent pattern and for a chaapu is the
 * chaapu's. So the drum reinforces what the student is already counting,
 * rather than inventing a phrase. Each one's role comes from the beat's
 * kriya (sam, the other claps, a wave, a finger count, or a fill between the
 * accents), and the kit's manifest names the stroke for each role: on the
 * mridangam, both heads for sam, the bass for a clap, and so on.
 *
 * This is a skeleton and says so. It isn't a sarvalaghu anyone plays, and a
 * pattern written by a mridangist should always win (see `patternFor`).
 */

/** Which role a beat's first tick plays: sam, a clap, a wave, or a finger count. */
function roleFor(image: string, sam: boolean): keyof Fallback {
  if (sam) return "sam";
  if (image === "down") return "clap";
  if (image === "open") return "wave";
  return "count";
}

/**
 * The pattern for a cycle of beats. Positions are fractions of the cycle, as
 * a written pattern's are, so this drops into the same sequencer. The strokes
 * come from the kit's `fallback` map, and a kit without one gets nothing.
 */
export function generatedPattern(beats: Beat[], shape: string, counts: Ratio, fallback: Fallback | undefined): Pattern | null {
  if (!fallback || beats.length === 0 || counts.n <= 0) return null;

  const strokes: PatternStroke[] = [];
  let at: Ratio = ZERO;
  beats.forEach((beat, index) => {
    beat.ticks.forEach((tick, tickIndex) => {
      const within = add(at, mul(tick.offset, beat.duration));
      strokes.push({
        at: mul(within, ratio(counts.d, counts.n)),
        stroke: fallback[tickIndex === 0 ? roleFor(beat.image, index === 0) : "fill"],
        gain: index === 0 && tickIndex === 0 ? 1.12 : 1,
      });
    });
    at = add(at, beat.duration);
  });
  if (strokes.length === 0) return null;

  return {
    id: "generated",
    name: "Generated from the tala",
    source: "generated from the tala's own beats, not a pattern anyone plays",
    shape,
    counts,
    nadai: "any",
    role: "main",
    beats: beats.length,
    aksharas: beats.length,
    strokes,
  };
}
