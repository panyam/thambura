import { For, Show, type Accessor } from "solid-js";
import { VARIETY_OPTIONS, type Variety } from "../engine/arrangement";
import type { KitState } from "./kitPresenter";
import type { Lane } from "../engine/lane";

/**
 * What the mridangam is playing, a cycle at a time: one cell per akshara,
 * each holding the strokes that fall in it, with the stroke being heard lit.
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
  const cells = () => {
    const lane = props.lane();
    if (!lane) return [];
    return Array.from({ length: lane.aksharas }, (_, akshara) =>
      lane.strokes
        .map((stroke, index) => ({ ...stroke, index }))
        .filter((stroke) => stroke.akshara === akshara)
        .sort((a, b) => a.within - b.within),
    );
  };

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
              {(strokes, akshara) => (
                <li
                  class="flex min-w-12 flex-1 flex-col items-center gap-0.5 rounded-md border px-1 py-1 text-center"
                  classList={{
                    "border-gray-300 dark:border-gray-600": akshara() !== 0,
                    // Sam, so the eye finds the start of the cycle.
                    "border-gray-400 bg-gray-50 dark:border-gray-500 dark:bg-gray-800": akshara() === 0,
                  }}
                >
                  <span class="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">{akshara() + 1}</span>
                  <Show when={strokes.length > 0} fallback={<span class="text-xs text-gray-300 dark:text-gray-600">·</span>}>
                    <For each={strokes}>
                      {(stroke) => (
                        <span
                          class="rounded px-1 text-xs transition-colors"
                          classList={{
                            "bg-amber-500 text-white": props.strokeIndex() === stroke.index,
                            "text-gray-700 dark:text-gray-300": props.strokeIndex() !== stroke.index,
                          }}
                        >
                          {label(stroke.stroke)}
                        </span>
                      )}
                    </For>
                  </Show>
                </li>
              )}
            </For>
          </ol>
        </section>
      )}
    </Show>
  );
}
