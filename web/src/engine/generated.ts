import type { Beat } from "./beat";
import { add, mul, ratio, ZERO, type Ratio } from "./ratio";
import type { Pattern, PatternStroke } from "./patterns";

/**
 * A plain accompaniment worked out from the tala itself, for the talas nobody
 * has written a pattern for.
 *
 * It plays where the tala's own claps play: every tick of every beat, which
 * for a sapta tala is the nadai's accent pattern and for a chaapu is the
 * chaapu's. So the drum reinforces what the student is already counting,
 * rather than inventing a phrase. Which stroke each one gets comes from the
 * beat's kriya: sam gets both heads, the other claps the bass, a wave the
 * ringing right head, and the finger counts a light nam, with anything
 * between the accents filled by a closed thi.
 *
 * This is a skeleton and says so. It isn't a sarvalaghu anyone plays, and a
 * pattern written by a mridangist should always win (see `patternFor`).
 */

/** What the fallback plays for each kind of beat. */
const SAM = "L.tham";
const CLAP = "L.thom";
const WAVE = "R.dhin";
const COUNT = "R.nam";
const FILL = "R.thi";

/** The kriyas the tala tables name: a clap, a wave, or a finger count. */
function strokeFor(image: string, sam: boolean): string {
  if (sam) return SAM;
  if (image === "down") return CLAP;
  if (image === "open") return WAVE;
  return COUNT;
}

/**
 * The pattern for a cycle of beats. Positions are fractions of the cycle, as
 * a written pattern's are, so this drops into the same sequencer.
 */
export function generatedPattern(beats: Beat[], shape: string, counts: Ratio): Pattern | null {
  if (beats.length === 0 || counts.n <= 0) return null;

  const strokes: PatternStroke[] = [];
  let at: Ratio = ZERO;
  beats.forEach((beat, index) => {
    beat.ticks.forEach((tick, tickIndex) => {
      const within = add(at, mul(tick.offset, beat.duration));
      strokes.push({
        at: mul(within, ratio(counts.d, counts.n)),
        stroke: tickIndex === 0 ? strokeFor(beat.image, index === 0) : FILL,
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
    beats: beats.length,
    strokes,
  };
}
