import type { Pattern } from "./patterns";
import { mul, ratio, type Ratio } from "./ratio";
import type { CountedSyllable } from "./syllables";

/** A pattern as the stroke lane draws it, over the tala's counting line. */
export interface Lane {
  name: string;
  source: string;
  /** How many cells the cycle divides into. */
  aksharas: number;
  /** How many slots each cell divides into, fine enough for every stroke and syllable to sit in one. */
  columns: number;
  strokes: { stroke: string; akshara: number; column: number }[];
  counting: { syllable: string; akshara: number; column: number }[];
}

// Past this many slots a cell is too narrow to read, so positions round to
// the nearest slot of the counting line instead.
const MAX_COLUMNS = 12;

/**
 * The pattern laid out for the lane: which akshara each stroke and counting
 * syllable falls in, and which slot of it. Positions are fractions of the
 * cycle, so this is the one place that decides how a cycle is divided for
 * reading.
 */
export function laneFor(pattern: Pattern | null, counting: CountedSyllable[]): Lane | null {
  if (!pattern || pattern.strokes.length === 0) return null;
  const aksharas = Math.max(1, pattern.aksharas);
  const place = (at: Ratio) => {
    const pos = mul(at, ratio(aksharas));
    const akshara = Math.min(aksharas - 1, Math.floor(pos.n / pos.d));
    return { akshara, within: ratio(pos.n - akshara * pos.d, pos.d) };
  };

  const strokes = pattern.strokes.map((s) => ({ stroke: s.stroke, ...place(s.at) }));
  const said = counting.map((c) => ({ syllable: c.syllable, ...place(c.at) }));

  let columns = [...strokes, ...said].reduce((cols, p) => lcm(cols, p.within.d), 1);
  if (columns > MAX_COLUMNS) columns = Math.max(1, Math.ceil(said.length / aksharas));
  const column = (within: Ratio) => Math.min(columns - 1, Math.round((within.n / within.d) * columns));

  return {
    name: pattern.name,
    source: pattern.source,
    aksharas,
    columns,
    strokes: strokes.map((s) => ({ stroke: s.stroke, akshara: s.akshara, column: column(s.within) })),
    counting: said.map((c) => ({ syllable: c.syllable, akshara: c.akshara, column: column(c.within) })),
  };
}

function lcm(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y) [x, y] = [y, x % y];
  return (a / x) * b;
}
