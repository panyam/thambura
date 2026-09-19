import { ONE, parseRatio, ZERO, type Ratio } from "./ratio";

/**
 * The unit of rhythm the player steps through.
 *
 * A beat lasts `duration` counts (one count = one tempo beat, 60/bpm seconds)
 * and shows one image. Its ticks are the sounds struck within it, each at an
 * `offset` that is a fraction of the beat's own duration, so a tick at 0.5 in a
 * 2-count beat lands one count in. Both are exact ratios (see ratio.ts).
 */
export interface Tick {
  sound: string;
  offset: Ratio;
}

export interface Beat {
  image: string;
  duration: Ratio;
  ticks: Tick[];
}

/**
 * The loose form beats are written in: a bare name ("down") is a one-count beat
 * with a single tick of the same sound at 0. Durations and offsets may be
 * fraction strings ("1/2").
 */
export type BeatEntry =
  | string
  | {
      name?: string;
      duration?: number | string;
      ticks?: { sound?: string; offset?: number | string }[];
    };

export function toBeat(entry: BeatEntry): Beat {
  if (typeof entry === "string") {
    return { image: entry, duration: ONE, ticks: [{ sound: entry, offset: ZERO }] };
  }
  const image = entry.name || "down";
  const duration = parseRatio(entry.duration, ONE);
  const ticks = entry.ticks
    ? entry.ticks.map((t) => ({ sound: t.sound || image, offset: parseRatio(t.offset, ZERO) }))
    : [{ sound: image, offset: ZERO }];
  return { image, duration, ticks };
}
