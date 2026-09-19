/**
 * The beat image's swing: the hand lifts after each beat and falls onto the
 * next, as a musician's hand does keeping tala. The image shrinks as the hand
 * rises and is back at full size exactly when the next beat sounds.
 *
 * The arc is a parabola, the path of a thrown object: it leaves the beat fast,
 * slows to the top and speeds up into the next beat, so the landing is felt.
 * A hand's arc has a natural length, so a slow beat holds still first and
 * swings only over its last MAX_ARC seconds. A fast beat is too short to
 * read as a swing (it flickers), so the depth fades from FULL_BEAT down to
 * none at MIN_BEAT: 120 to 240 bpm for a one-count beat.
 */

/** How much the image shrinks at the top of the arc. */
export const SWING_DEPTH = 0.2;

/** The longest arc, in seconds. */
export const MAX_ARC = 0.8;

/** Beats this long or longer, in seconds, swing at full depth. */
export const FULL_BEAT = 0.5;

/** Beats this short or shorter don't swing. */
export const MIN_BEAT = 0.25;

/** The image's scale `elapsed` seconds into a beat `length` seconds long. */
export function swingScale(elapsed: number, length: number): number {
  if (!(length > MIN_BEAT)) return 1;
  const depth = SWING_DEPTH * Math.min(1, (length - MIN_BEAT) / (FULL_BEAT - MIN_BEAT));
  const arc = Math.min(length, MAX_ARC);
  const u = (elapsed - (length - arc)) / arc;
  if (!(u > 0 && u < 1)) return 1;
  return 1 - depth * 4 * u * (1 - u);
}
