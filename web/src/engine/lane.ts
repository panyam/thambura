import type { Pattern } from "./patterns";

/** A pattern as the stroke lane draws it. */
export interface Lane {
  name: string;
  source: string;
  /** How many cells the cycle divides into. */
  aksharas: number;
  strokes: { stroke: string; akshara: number; within: number }[];
}

/**
 * The pattern laid out for the lane: which akshara each stroke falls in, and
 * how far through it. Positions are fractions of the cycle, so this is the
 * one place that decides how a cycle is divided for reading.
 */
export function laneFor(pattern: Pattern | null): Lane | null {
  if (!pattern || pattern.strokes.length === 0) return null;
  const aksharas = Math.max(1, pattern.aksharas);
  return {
    name: pattern.name,
    source: pattern.source,
    aksharas,
    strokes: pattern.strokes.map((s) => {
      const at = (s.at.n / s.at.d) * aksharas;
      const akshara = Math.min(aksharas - 1, Math.floor(at));
      return { stroke: s.stroke, akshara, within: at - akshara };
    }),
  };
}
