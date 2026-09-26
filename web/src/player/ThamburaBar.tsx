import { createEffect, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { BUILT_IN_PRESETS } from "../engine/presets";
import { THAMBURA_MODES, type ThamburaMode } from "../engine/shruthi";
import { THAMBURA_VIEWS } from "./thamburaPresenter";
import { copyText, PlayButton, Segmented, SMALL_SELECT, type ThamburaViewProps } from "./thamburaControls";
import { ThamburaLab } from "./ThamburaLab";
import { ThamburaMini } from "./ThamburaMini";
import { ThamburaRaagini } from "./ThamburaRaagini";
import { ThamburaStudio } from "./ThamburaStudio";

// Built-in sounds in the menu are prefixed, so they can't collide with a preset's id.
const MODE = "mode:";

/**
 * The floating thambura bar. It slides up from the bottom of the window when
 * open. Its header holds the start/stop button, the Sound menu (built-in
 * sounds and saved presets, which play as soon as they're picked) and a
 * switch between the views, all of which drive the same presenter.
 * `open` says whether it is showing (the drawer's state, not the presenter's)
 * and `onHide` is its hide button. `onHeight` reports the space it covers
 * (0 when hidden) so the page can leave room for it. With `shareUrl` the header can copy a link to the
 * current setup; the Lab saves presets.
 */
export function ThamburaBar(
  props: ThamburaViewProps & { open: () => boolean; onHide: () => void; onHeight?: (px: number) => void },
) {
  const st = () => props.state();
  const a = props.actions;
  let panel!: HTMLDivElement;
  const [copied, setCopied] = createSignal<"" | "Link copied" | "Copy the address bar instead">("");
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(copiedTimer));
  const copy = async () => {
    const ok = props.shareUrl ? await copyText(props.shareUrl(a.shareLink())) : false;
    setCopied(ok ? "Link copied" : "Copy the address bar instead");
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => setCopied(""), 2500);
  };

  const report = () => props.onHeight?.(props.open() ? panel.offsetHeight : 0);
  onMount(() => {
    const ro = new ResizeObserver(report);
    ro.observe(panel);
    onCleanup(() => ro.disconnect());
  });
  createEffect(() => {
    // A hidden bar keeps its controls out of the tab order and away from screen readers.
    panel.inert = !props.open();
    report();
  });

  return (
    <div class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 sm:px-4 print:hidden">
      <div
        ref={panel}
        role="region"
        aria-label="Thambura"
        class={`pointer-events-auto w-full ${st().view === "lab" ? "max-w-6xl" : "max-w-3xl"} rounded-t-2xl border border-b-0 border-gray-200 bg-white/95 backdrop-blur transition-[transform,box-shadow] duration-300 ease-out dark:border-gray-700 dark:bg-gray-900/95 ${
          props.open() ? "translate-y-0 shadow-[0_-8px_30px_rgba(0,0,0,0.15)]" : "translate-y-[110%] shadow-none"
        }`}
      >
        <div class="flex items-start gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <PlayButton playing={st().playing} onClick={() => void a.toggle()} class="h-8 w-8" />
          {/* Wraps on the narrowest phones so the hide button stays in reach. */}
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <span class="hidden text-sm font-semibold sm:inline">Thambura</span>
            <select
              aria-label="Sound"
              class={SMALL_SELECT}
              onChange={(e) => {
                const choice = e.currentTarget.value;
                if (choice.startsWith(MODE)) a.playMode(choice.slice(MODE.length) as ThamburaMode);
                else if (choice) a.applyPreset(choice);
              }}
            >
              {/* Unsaved edits are a choice of their own, so picking a sound and coming back is possible. */}
              <Show when={!st().presetId && st().settings.mode === "custom"}>
                <option value="" selected>
                  Custom (unsaved)
                </option>
              </Show>
              <optgroup label="Built-in">
                <For each={THAMBURA_MODES.filter((m) => m.id !== "custom")}>
                  {(m) => (
                    <option value={MODE + m.id} selected={!st().presetId && m.id === st().settings.mode}>
                      {m.label}
                    </option>
                  )}
                </For>
              </optgroup>
              <optgroup label="Presets">
                <For each={BUILT_IN_PRESETS}>
                  {(p) => (
                    <option value={p.id} selected={p.id === st().presetId}>
                      {p.name}
                      {p.id === st().presetId && st().edited ? " (edited)" : ""}
                    </option>
                  )}
                </For>
              </optgroup>
              <Show when={st().presets.length > 0}>
                <optgroup label="Saved">
                  <For each={st().presets}>
                    {(p) => (
                      <option value={p.id} selected={p.id === st().presetId}>
                        {p.name}
                        {p.id === st().presetId && st().edited ? " (edited)" : ""}
                      </option>
                    )}
                  </For>
                </optgroup>
              </Show>
            </select>
            <Segmented label="Thambura view" size="sm" value={st().view} options={THAMBURA_VIEWS.map((v) => ({ value: v.id, label: v.label }))} onChange={(v) => a.setView(v)} />
          </div>
          <Show when={props.shareUrl}>
            <button
              type="button"
              aria-label="Copy link"
              title="Copy a link to this setup"
              onClick={() => void copy()}
              class="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M11.5 3.6a3.5 3.5 0 0 1 4.9 4.9l-2.1 2.1a3.5 3.5 0 0 1-4.95 0 .75.75 0 1 1 1.06-1.06 2 2 0 0 0 2.83 0l2.1-2.1a2 2 0 0 0-2.83-2.83l-.7.7a.75.75 0 1 1-1.06-1.06z" />
                <path d="M8.5 16.4a3.5 3.5 0 0 1-4.9-4.9l2.1-2.1a3.5 3.5 0 0 1 4.95 0 .75.75 0 1 1-1.06 1.06 2 2 0 0 0-2.83 0l-2.1 2.1a2 2 0 0 0 2.83 2.83l.7-.7a.75.75 0 1 1 1.06 1.06z" />
              </svg>
            </button>
          </Show>
          <button
            type="button"
            aria-label="Hide thambura"
            onClick={() => props.onHide()}
            class="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
        <Show when={copied() || st().notice}>
          <div
            role="status"
            class="flex items-start gap-2 border-b border-gray-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-gray-700 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <span class="flex-1">{copied() || st().notice}</span>
            <Show when={!copied()}>
              <button type="button" aria-label="Dismiss" class="shrink-0 rounded px-1 hover:bg-amber-100 dark:hover:bg-amber-900/50" onClick={() => a.dismissNotice()}>
                ×
              </button>
            </Show>
          </div>
        </Show>
        <div class="max-h-[70vh] overflow-y-auto p-3 sm:p-4">
          <Switch>
            <Match when={st().view === "mini"}>
              <ThamburaMini state={props.state} actions={a} />
            </Match>
            <Match when={st().view === "studio"}>
              <ThamburaStudio state={props.state} actions={a} />
            </Match>
            <Match when={st().view === "raagini"}>
              <ThamburaRaagini state={props.state} actions={a} />
            </Match>
            <Match when={st().view === "lab"}>
              <ThamburaLab state={props.state} actions={a} shareUrl={props.shareUrl} analyser={props.analyser} />
            </Match>
          </Switch>
        </div>
      </div>
    </div>
  );
}
