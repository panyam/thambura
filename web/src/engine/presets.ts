import type { ThamburaPreset } from "../player/thamburaPresenter";

/**
 * Sounds that ship with the app, offered beside the built-in voices. Each is
 * a share link (engine/shareLink.ts), the same thing a listener's own preset
 * is, so one arrives here by being pasted in: build it in the Lab, copy its
 * link, and add it below.
 *
 * These two lean Hindustani (issue #51): a bigger instrument at C#3 with a
 * slower round, a longer ring, nothing damped, and a jawari that holds
 * instead of falling back. "Shimmer" keeps the bloom bright and sustained;
 * "Warm" sets it lower and wider. Neither was fitted to a recording of a
 * tanpura; they move the Lab's controls from the fitted Carnatic voice, and
 * whether they're closer is a question for ears (#51).
 */
export const BUILT_IN_PRESETS: ThamburaPreset[] = [
  {
    id: "builtin:shimmer",
    name: "Shimmer",
    link: "ARwDBEAHETACijIyPADY5g8BDwcCDxEED2MFDwMGDwAHDxQJB1wJCDQKD2QLDxYMDzUNDzQODxgPDzcYBOEBAA",
  },
  {
    id: "builtin:warm",
    name: "Warm",
    link: "ARwDBEAHETACijIyPADY5g0BDwUCDxUED2MFDwMGDwAHDxcKD1ALDxkMD04NDywODxQPDzIYBOEBAA",
  },
];

/** Whether a preset ships with the app, and so can't be renamed, deleted or written over. */
export function isBuiltIn(id: string | null): boolean {
  return !!id && BUILT_IN_PRESETS.some((p) => p.id === id);
}
