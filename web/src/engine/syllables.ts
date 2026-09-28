import type { Beat } from "./beat";
import type { ChaapuTala, Gati } from "./carnatic";
import { add, mul, ratio, ZERO, type Ratio } from "./ratio";
import type { TalaSettings } from "./selection";
import SYLLABLE_DATA from "./syllables.data.json";

/**
 * The spoken syllables, and the counting line a student says along with the
 * tala (docs/designs/solkattu.md, reviews 2 and 4).
 *
 * Everything outside this file holds a syllable's id, never its spelling, so
 * choosing "jo" over "ja", or showing another script later, changes only the
 * table below.
 */
export interface Syllable {
  id: string;
  /** How the app writes it. */
  shown: string;
  /** Other spellings of the same sound, accepted wherever syllables are read. */
  aliases: string[];
}

// Merged spellings are aliases; ones the design holds apart (thom and dhom,
// ta and tha, tam and tang) are separate ids until a player says otherwise.
// The table is JSON so the pattern compiler reads the same one.
export const SYLLABLES: Syllable[] = SYLLABLE_DATA;

const BY_SPELLING = new Map<string, string>(SYLLABLES.flatMap((s) => [s.id, ...s.aliases].map((spelling) => [spelling, s.id] as [string, string])));
const SHOWN = new Map(SYLLABLES.map((s) => [s.id, s.shown]));

/** The id for any spelling of a syllable, ignoring case, or null for one the table doesn't know. */
export function resolveSyllable(spelling: string): string | null {
  return BY_SPELLING.get(spelling.toLowerCase()) ?? null;
}

/** How the app writes a syllable id. An unknown id is shown as it is. */
export function shown(id: string): string {
  return SHOWN.get(id) ?? id;
}

/**
 * One count said per slot, by gati. A sapta tala says its nadai's line in
 * every akshara. A chaapu says its own line once across the cycle, so misra
 * chaapu counts ta ki ta ta ka di mi, and vilomam, its reverse, ta ka di mi
 * ta ki ta.
 */
export const COUNTING: Record<Gati, string[]> = {
  thisram: ["ta", "ki", "ta"],
  chatusram: ["ta", "ka", "di", "mi"],
  khandam: ["ta", "ka", "ta", "ki", "ta"],
  misram: ["ta", "ki", "ta", "ta", "ka", "di", "mi"],
  vilomam: ["ta", "ka", "di", "mi", "ta", "ki", "ta"],
  sankeernam: ["ta", "ka", "di", "mi", "ta", "ka", "ta", "ki", "ta"],
};

/** A counting syllable and where it's said, as a fraction of the cycle like a pattern's strokes. */
export interface CountedSyllable {
  syllable: string;
  at: Ratio;
}

/**
 * The counting line for one cycle of the tala, kalai ignored, since a
 * pattern and its lane ignore it too. Positions are fractions of the cycle,
 * so the lane lays syllables out the way it lays out strokes.
 */
export function countingFor(settings: TalaSettings, beats: Beat[]): CountedSyllable[] {
  const cycle = beats.reduce((sum, beat) => add(sum, beat.duration), ZERO);
  if (cycle.n <= 0) return [];
  const chaapu = settings.tala.startsWith("chaapu_") ? (settings.tala.slice("chaapu_".length) as ChaapuTala) : null;
  const line = COUNTING[chaapu ?? settings.nadai];
  const perCycle = ratio(cycle.d, cycle.n);

  const out: CountedSyllable[] = [];
  let start: Ratio = ZERO;
  for (const beat of beats) {
    line.forEach((syllable, i) => {
      out.push({ syllable, at: mul(add(start, mul(beat.duration, ratio(i, line.length))), perCycle) });
    });
    start = add(start, beat.duration);
  }
  return out;
}
