import { For, Show, type Accessor } from "solid-js";
import type { KitState } from "./kitPresenter";
import type { Lane } from "./presenter";

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
        <section class="w-full max-w-md" aria-label="Mridangam pattern">
          <div class="mb-1 flex items-baseline justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{lane.name}</span>
            <Show when={lane.source.startsWith("generated")}>
              <span class="italic">a skeleton, not a pattern anyone plays</span>
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
