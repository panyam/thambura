import { For, Show, createEffect, onCleanup, type Accessor } from "solid-js";
import type { KitPresenter, KitState } from "./kitPresenter";

export type KitActions = Pick<
  KitPresenter,
  "play" | "setVolume" | "setZoneLevel" | "setEnabled" | "strokeForKey" | "setVariety" | "askForKorvai"
>;

/**
 * The stroke pad: every stroke in the kit, grouped by zone, played by click or
 * by the key on its face. It shows which pack is sounding and how far it is
 * being shifted, which is how a kit gets checked by ear against the thambura.
 *
 * It renders whatever the manifest says, so it serves a ghatam or a tabla as
 * well as the mridangam. The section is hidden until a kit loads, since none
 * is committed yet.
 */
export function StrokePad(props: { state: Accessor<KitState>; actions: KitActions }) {
  const s = props.state;
  const a = props.actions;
  const inZone = (zone: string) => s().strokes.filter((x) => x.zone === zone);

  // The keys play strokes while the pad is on the page, except while typing.
  createEffect(() => {
    if (s().status !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const id = a.strokeForKey(e.key);
      if (!id) return;
      e.preventDefault();
      void a.play(id);
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <Show when={s().status === "ready"}>
      <section class="w-full max-w-md" aria-label={title(s())}>
        <details class="group rounded-lg border border-gray-200 dark:border-gray-700">
          <summary class="cursor-pointer select-none px-3 py-2 text-sm font-medium">{title(s())}</summary>
          <div class="grid gap-4 px-3 pb-3">
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label="Play with the tala"
                checked={s().enabled}
                onChange={(e) => a.setEnabled(e.currentTarget.checked)}
                class="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-800"
              />
              Play with the tala
              <span class="text-xs text-gray-500 dark:text-gray-400">
                <Show when={s().pattern} fallback="no pattern for this tala yet">
                  {s().pattern}
                </Show>
              </span>
            </label>

            <p class="text-xs text-gray-500 dark:text-gray-400">
              <Show when={s().pitched} fallback={<>{s().kitName}, played as recorded</>}>
                {s().kitName}, tuned to the thambura: {s().packLabel}
                <Show when={s().shift !== 0}>
                  {" "}
                  shifted {s().shift > 0 ? "+" : ""}
                  {s().shift} cents
                </Show>
                <Show when={s().stretched}>
                  {" "}
                  <span class="text-amber-700 dark:text-amber-500">(further than one drum stretches)</span>
                </Show>
              </Show>
            </p>

            <For each={s().zones}>
              {(group) => (
                <div>
                  <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {group.label}
                  </h3>
                  <div class="flex flex-wrap gap-2">
                    <For each={inZone(group.id)}>
                      {(stroke) => (
                        <button
                          type="button"
                          aria-label={`Play ${stroke.label}, ${group.label}`}
                          title={stroke.note}
                          disabled={!stroke.playable}
                          onPointerDown={() => void a.play(stroke.id)}
                          class="flex h-16 w-20 flex-col items-center justify-center rounded-lg border text-sm transition-colors disabled:opacity-40"
                          classList={{
                            "border-amber-500 bg-amber-100 dark:bg-amber-900/50": s().lit === stroke.id,
                            "border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700":
                              s().lit !== stroke.id,
                          }}
                        >
                          <span class="font-medium">{stroke.label}</span>
                          <span class="text-xs text-gray-500 dark:text-gray-400">{stroke.key}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="text-sm">
                <span class="mb-1 flex items-center justify-between">
                  Volume <span class="text-gray-500 dark:text-gray-400">{s().volume}%</span>
                </span>
                <input
                  type="range"
                  aria-label={`${title(s())} volume`}
                  min={0}
                  max={100}
                  value={s().volume}
                  onInput={(e) => a.setVolume(e.currentTarget.valueAsNumber)}
                  class="w-full accent-amber-600"
                />
              </label>
              <For each={s().zones}>
                {(zone) => (
                  <label class="text-sm">
                    <span class="mb-1 flex items-center justify-between">
                      {zone.label}
                      <span class="text-gray-500 dark:text-gray-400">{Math.round((s().levels[zone.id] ?? 1) * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      aria-label={`${zone.label} level`}
                      min={0}
                      max={100}
                      value={Math.round((s().levels[zone.id] ?? 1) * 100)}
                      onInput={(e) => a.setZoneLevel(zone.id, e.currentTarget.valueAsNumber / 100)}
                      class="w-full accent-amber-600"
                    />
                  </label>
                )}
              </For>
            </div>
          </div>
        </details>
      </section>
    </Show>
  );
}

/** The instrument's name, capitalised, for the heading and the labels. */
function title(state: KitState): string {
  const name = state.instrument || "Kit";
  return name.charAt(0).toUpperCase() + name.slice(1);
}
