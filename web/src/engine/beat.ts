/**
 * The unit of rhythm the player steps through.
 *
 * A beat lasts `duration` counts (one count = one tempo beat, 60/bpm seconds)
 * and shows one image. Its ticks are the sounds struck within it, each at an
 * `offset` that is a fraction of the beat's own duration, so a tick at 0.5 in a
 * 2-count beat lands one count in.
 */
export interface Tick {
  sound: string;
  offset: number;
}

export interface Beat {
  image: string;
  duration: number;
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
    return { image: entry, duration: 1, ticks: [{ sound: entry, offset: 0 }] };
  }
  const image = entry.name || "down";
  const duration = parseNumber(entry.duration, 1);
  const ticks = entry.ticks
    ? entry.ticks.map((t) => ({ sound: t.sound || image, offset: parseNumber(t.offset, 0) }))
    : [{ sound: image, offset: 0 }];
  return { image, duration, ticks };
}

/** Parses a number or a "p/q" fraction string, falling back when unparseable. */
export function parseNumber(value: number | string | undefined, fallback = 0): number {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const slash = value.indexOf("/");
  if (slash < 0) {
    const n = parseFloat(value);
    return Number.isNaN(n) ? fallback : n;
  }
  const num = parseFloat(value.slice(0, slash));
  const den = parseFloat(value.slice(slash + 1));
  if (Number.isNaN(num) || Number.isNaN(den) || den === 0) return fallback;
  return num / den;
}
