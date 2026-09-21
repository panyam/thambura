import type { Gati } from "./carnatic";
import { add, mul, ratio, type Ratio } from "./ratio";
import type { TalaGrid } from "./talaGrid";

/**
 * The patterns a mridangam plays, hand-written for now.
 *
 * A pattern is written in aksharas, not seconds: a stroke sits at akshara 3
 * and three quarters of the way through it, and the tempo map turns that into
 * a time when it's pulled. So a pattern stretches with kalai and follows a
 * tempo change without knowing either happened.
 *
 * `docs/mridangam.md` has the text format these will be parsed from. This
 * file is shaped like what that parser will produce, so the format arrives
 * without the sequencer changing.
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
 * Builds a pattern from one token per slot, `|` separating aksharas. A `,` is
 * a rest, as karvai is written in Carnatic notation. Every akshara has to
 * carry the same number of slots, which is what catches a typo.
 */
export function pattern(spec: {
  id: string;
  name: string;
  /** The cycle it accompanies, as `TalaGrid.shape` writes one. */
  shape: string;
  nadai: Gati;
  /** One token per slot, `|` between aksharas, `,` for a rest. */
  line: string;
  /** Per-akshara loudness, so sam can be leaned on. */
  accents?: Record<number, number>;
}): Pattern {
  const { id, name, shape, nadai, line, accents = {} } = spec;
  const aksharas = line
    .split("|")
    .map((a) => a.trim())
    .filter((a) => a !== "");
  const slots = aksharas[0]?.split(/\s+/).length ?? 0;
  const strokes: PatternStroke[] = [];
  aksharas.forEach((akshara, beat) => {
    const tokens = akshara.split(/\s+/);
    if (tokens.length !== slots) {
      throw new Error(`pattern ${id}: akshara ${beat + 1} has ${tokens.length} slots, expected ${slots}`);
    }
    tokens.forEach((token, slot) => {
      if (token === ",") return;
      strokes.push({
        at: add(ratio(beat), ratio(slot, slots)),
        stroke: token,
        gain: accents[beat] ?? 1,
      });
    });
  });
  const beats = shape.split(/\s+/).filter((b) => b !== "").length;
  if (beats !== aksharas.length) {
    throw new Error(`pattern ${id}: ${aksharas.length} aksharas written for a cycle of ${beats} beats`);
  }
  return { id, name, shape, beats, nadai, strokes };
}

/**
 * A plain Adi sarvalaghu in chatusram, four slots to the akshara: thom on sam
 * and on the second laghu beat, the finger counts light, and the dhrutham's
 * wave answered with nam. Sarvalaghu is the flowing accompaniment a mridangist
 * plays through a cycle, as against the korvais and mohras that end one. This
 * is a beginner's version and wants a player's eye before a student hears it
 * (see docs/mridangam.md, open question 3).
 */
export const ADI_CHATUSRAM = pattern({
  id: "adi-chatusram-1",
  name: "Adi sarvalaghu, chatusram",
  shape: "down one two three down open down open",
  nadai: "chatusram",
  line: [
    "L.tham , R.thi ,",
    "R.nam , R.thi ,",
    "L.thom , R.thi ,",
    "R.nam , R.thi R.thi",
    "L.tham , R.thi ,",
    "R.nam , R.thi ,",
    "L.thom , R.thi ,",
    "R.nam R.thi R.nam ,",
  ].join("|"),
  accents: { 0: 1.15, 4: 1.05 },
});

export const PATTERNS: Pattern[] = [ADI_CHATUSRAM];

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
