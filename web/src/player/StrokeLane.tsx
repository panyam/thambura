import { createMemo, For, Show, type Accessor } from "solid-js";
import { VARIETY_OPTIONS, type Variety } from "../engine/arrangement";
import type { KitState } from "./kitPresenter";
import { litStrokes, type Lane } from "../engine/lane";

/**
 * What the mridangam is playing, a cycle at a time: one cell per akshara,
 * each divided into its slots, with the tala's counting syllable (ta ka di
 * mi) beside each slot and the strokes that fall in it, the one being heard
 * lit.
 *
 * It lights from the player's `strokeIndex`, which is set when a stroke
 * reaches the speakers rather than when it was booked, so the lane and the
 * sound agree the way the beat images do.
 */
export function StrokeLane(props: {
  lane: Accessor<Lane | null>;
  strokeIndex: Accessor<number | null>;
  kit: Accessor<KitState>;
  variety: Accessor<Variety>;
  setVariety: (variety: Variety) => void;
  /** Whether this tala has anything to swap in. */
  hasVariations: Accessor<boolean>;
  /** Whether it has an ending, and whether one is on its way. */
  hasKorvai: Accessor<boolean>;
  korvaiQueued: Accessor<boolean>;
  askForKorvai: () => void;
  /** Takes the width it's given (a kit's row) rather than the tala's column. */
  full?: boolean;
}) {
  // Each akshara as its slots, top to bottom: the counting syllable said there
  // and the strokes that fall in it.
  const cells = () => {
    const lane = props.lane();
    if (!lane) return [];
    const strokes = lane.strokes.map((stroke, index) => ({ ...stroke, index }));
    return Array.from({ length: lane.aksharas }, (_, akshara) =>
      Array.from({ length: lane.columns }, (_, column) => ({
        syllable: lane.counting.find((c) => c.akshara === akshara && c.column === column)?.syllable ?? null,
        strokes: strokes.filter((s) => s.akshara === akshara && s.column === column),
      })),
    );
  };

  // A pair's two strokes light together, whichever of them was heard last.
  const lit = createMemo(() => {
    const lane = props.lane();
    return lane ? litStrokes(lane, props.strokeIndex()) : new Set<number>();
  });

  // The kit's own name for a stroke, so the lane reads as the pads do.
  const label = (id: string) => props.kit().strokes.find((s) => s.id === id)?.label ?? id;

  return (
    <Show when={props.lane()} keyed>
      {(lane) => (
        <section class={props.full ? "w-full" : "w-full max-w-md"} aria-label="Mridangam pattern">
          <div class="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span>
              {lane.name}
              <Show when={lane.source.startsWith("generated")}>
                <span class="italic"> · a skeleton, not a pattern anyone plays</span>
              </Show>
            </span>
            <Show when={props.hasKorvai()}>
              <button
                type="button"
                aria-label="Play the korvai at the next cycle"
                onClick={() => props.askForKorvai()}
                disabled={props.korvaiQueued()}
                class="rounded-md border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                {props.korvaiQueued() ? "Korvai next cycle" : "Korvai"}
              </button>
            </Show>
            <Show when={props.hasVariations()}>
              <label class="flex items-center gap-1">
                Variety
                <select
                  aria-label="How often to vary the pattern"
                  value={props.variety()}
                  onChange={(e) => props.setVariety(e.currentTarget.value as Variety)}
                  class="rounded-md border-gray-300 bg-white py-0.5 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <For each={VARIETY_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                </select>
              </label>
            </Show>
          </div>
          <ol class="flex gap-1 overflow-x-auto pb-1" role="list">
            <For each={cells()}>
              {(slots, akshara) => (
                <li
                  class="flex min-w-16 flex-1 flex-col items-center gap-0.5 rounded-md border px-1 py-1"
                  classList={{
                    "border-gray-300 dark:border-gray-600": akshara() !== 0,
                    // Sam, so the eye finds the start of the cycle.
                    "border-gray-400 bg-gray-50 dark:border-gray-500 dark:bg-gray-800": akshara() === 0,
                  }}
                >
                  <span class="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">{akshara() + 1}</span>
                  <div class="grid w-full grid-cols-[auto_1fr] items-center gap-x-1">
                    <For each={slots}>
                      {(slot) => (
                        <>
                          {/* The count is said, never struck, so it stays quiet and never lights. */}
                          <span class="text-right text-[10px] italic leading-4 text-gray-400 dark:text-gray-500">{slot.syllable ?? ""}</span>
                          <span class="flex min-h-4 flex-col items-start">
                            <For each={slot.strokes}>
                              {(stroke) => (
                                <span
                                  class="whitespace-nowrap rounded px-1 text-xs leading-4 transition-colors"
                                  classList={{
                                    "bg-amber-500 text-white": lit().has(stroke.index),
                                    "text-gray-700 dark:text-gray-300": !lit().has(stroke.index),
                                  }}
                                >
                                  {label(stroke.stroke)}
                                </span>
                              )}
                            </For>
                          </span>
                        </>
                      )}
                    </For>
                  </div>
                </li>
              )}
            </For>
          </ol>
        </section>
      )}
    </Show>
  );
}
