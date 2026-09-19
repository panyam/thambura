/**
 * How the beat image moves between beats, so it carries the feel of a hand
 * keeping tala rather than only switching pictures. Each motion maps a moment
 * in the beat to a pose; every one is at rest (or, for the pop, at its peak)
 * exactly when a beat sounds.
 *
 * The swing-style motions (everything but the pop) share three rules:
 * - An arc is a parabola, the path of a thrown object: it leaves fast, slows
 *   at the top and speeds up into the landing, so the beat is felt.
 * - A hand's arc has a natural length, so a slow beat holds still first and
 *   moves only over its last MAX_ARC seconds.
 * - A fast beat is too short to read as motion (it flickers), so the depth
 *   fades from FULL_BEAT down to none at MIN_BEAT: 120 to 240 bpm for a
 *   one-count beat.
 */

export type BeatMotion = "swing" | "dip" | "fade" | "decay" | "pop" | "lift" | "off";

export const MOTION_OPTIONS: { id: BeatMotion; label: string }[] = [
  { id: "lift", label: "Lift and drop" },
  { id: "dip", label: "Eased dip" },
  { id: "swing", label: "Size swing" },
  { id: "fade", label: "Fade swing" },
  { id: "decay", label: "Fade after the strike" },
  { id: "pop", label: "Pop on the beat" },
  { id: "off", label: "Off" },
];

export const DEFAULT_MOTION: BeatMotion = "lift";

export function isBeatMotion(v: unknown): v is BeatMotion {
  return MOTION_OPTIONS.some((o) => o.id === v);
}

/**
 * What the view applies to the image. `lift` is 0 at rest and 1 at the top
 * of the lift; the view turns it into a rise and a shrinking shadow.
 */
export interface BeatPose {
  scale: number;
  opacity: number;
  lift: number;
}

export const REST: BeatPose = { scale: 1, opacity: 1, lift: 0 };

/** The longest arc, in seconds. */
export const MAX_ARC = 0.8;

/** Beats this long or longer, in seconds, move at full depth. */
export const FULL_BEAT = 0.5;

/** Beats this short or shorter don't move (except for the pop). */
export const MIN_BEAT = 0.25;

/** How far the size swing shrinks the image at the top of its arc. */
export const SWING_DEPTH = 0.2;

/** The pose `elapsed` seconds into a beat `length` seconds long. */
export function motionAt(motion: BeatMotion, elapsed: number, length: number): BeatPose {
  if (motion === "off" || !(length > 0) || elapsed < 0 || elapsed >= length) return REST;
  if (motion === "pop") return { ...REST, scale: 1 + 0.08 * Math.exp(-elapsed / 0.06) };
  const depth = Math.max(0, Math.min(1, (length - MIN_BEAT) / (FULL_BEAT - MIN_BEAT)));
  if (depth === 0) return REST;
  switch (motion) {
    case "swing":
      return { ...REST, scale: 1 - SWING_DEPTH * depth * parabola(arc(elapsed, length, MAX_ARC)) };
    case "dip": {
      // Still for most of the beat, then a short, shallow dip: it eases away
      // and falls faster and faster onto the beat.
      const u = arc(elapsed, length, Math.min(0.45, length / 2));
      let g = 0;
      if (u !== null) g = u < 0.6 ? smooth(u / 0.6) : 1 - ((u - 0.6) / 0.4) ** 3;
      return { ...REST, scale: 1 - 0.1 * depth * g };
    }
    case "fade":
      return { ...REST, opacity: 1 - 0.65 * depth * parabola(arc(elapsed, length, MAX_ARC)) };
    case "decay": {
      // Bright on the beat, then dying away like the struck sound.
      const tau = 0.3 * Math.min(length, 1);
      return { ...REST, opacity: 1 - 0.7 * depth * (1 - Math.exp(-elapsed / tau)) };
    }
    case "lift": {
      const h = depth * parabola(arc(elapsed, length, MAX_ARC));
      return { scale: 1 + 0.03 * h, opacity: 1, lift: h };
    }
  }
}

/** Where `elapsed` is in an arc over the beat's last `maxArc` seconds (0..1), or null outside it. */
function arc(elapsed: number, length: number, maxArc: number): number | null {
  const a = Math.min(length, maxArc);
  const u = (elapsed - (length - a)) / a;
  return u > 0 && u < 1 ? u : null;
}

function parabola(u: number | null): number {
  return u === null ? 0 : 4 * u * (1 - u);
}

function smooth(w: number): number {
  return w * w * (3 - 2 * w);
}
