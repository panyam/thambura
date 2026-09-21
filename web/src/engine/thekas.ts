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
  /** How many beats of tala it fits, ignoring kalai. Adi and Thriputa are 8. */
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
export function pattern(
  id: string,
  name: string,
  nadai: Gati,
  line: string,
  accents: Record<number, number> = {},
): Pattern {
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
  return { id, name, beats: aksharas.length, nadai, strokes };
}

/**
 * A plain Adi theka in chatusram, four slots to the akshara: thom on sam and
 * on the second laghu beat, the finger counts light, and the dhrutham's wave
 * answered with nam. It is a beginner's accompaniment, not a tani, and it
 * wants a player's eye before it goes near a student (see docs/mridangam.md,
 * open question 3).
 */
export const ADI_CHATUSRAM = pattern(
  "adi-chatusram-1",
  "Adi, chatusram",
  "chatusram",
  [
    "L.tham , R.thi ,",
    "R.nam , R.thi ,",
    "L.thom , R.thi ,",
    "R.nam , R.thi R.thi",
    "L.tham , R.thi ,",
    "R.nam , R.thi ,",
    "L.thom , R.thi ,",
    "R.nam R.thi R.nam ,",
  ].join("|"),
  { 0: 1.15, 4: 1.05 },
);

export const THEKAS: Pattern[] = [ADI_CHATUSRAM];

/**
 * The pattern for a tala, or null when none fits. A pattern matches on the
 * beats in a cycle and the nadai, so the Adi theka serves both Adi and a
 * chatusra-jaathi Thriputa, which are the same eight aksharas. A chaapu has
 * one long beat rather than even aksharas, so nothing matches it yet.
 */
export function patternFor(grid: TalaGrid, nadai: Gati, from: Pattern[] = THEKAS): Pattern | null {
  if (!grid.uniform) return null;
  return from.find((p) => p.beats === grid.beatCount && p.nadai === nadai) ?? null;
}

/** Where a pattern's stroke falls in counts, given how long one beat lasts. */
export function strokeCount(stroke: PatternStroke, countsPerBeat: Ratio): Ratio {
  return mul(stroke.at, countsPerBeat);
}
