import { createSignal, For, lazy, Match, onCleanup, Show, Suspense, Switch } from "solid-js";
import { BUILT_IN_PRESETS } from "../engine/presets";
import { THAMBURA_MODES, type ThamburaMode } from "../engine/shruthi";
import { THAMBURA_VIEWS } from "./thamburaPresenter";
import { copyText, PlayButton, Segmented, SMALL_SELECT, type ThamburaViewProps } from "./thamburaControls";
import { ThamburaMini } from "./ThamburaMini";
import { ThamburaStudio } from "./ThamburaStudio";

// The Lab and the Raagini are the two largest views and most visits use
// neither, so they load on first use, from their own chunks (build.mjs). The
// service worker precaches the chunks, so after one visit they open offline.
const ThamburaLab = lazy(() => import("./ThamburaLab").then((m) => ({ default: m.ThamburaLab })));
const ThamburaRaagini = lazy(() => import("./ThamburaRaagini").then((m) => ({ default: m.ThamburaRaagini })));

/** Shown in place of a view while its code arrives, the first time it's opened. */
function ViewLoading(props: { name: string }) {
  return (
    <div role="status" class="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
      <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      </svg>
      Loading the {props.name}…
    </div>
  );
}

// Built-in sounds in the menu are prefixed, so they can't collide with a preset's id.
const MODE = "mode:";

export interface ThamburaPanelProps extends ThamburaViewProps {
  /** The hide button, for a panel in a drawer. A docked panel has none. */
  onHide?: () => void;
  /** Classes for the view area: the drawer caps its height and scrolls, a docked panel doesn't. */
  bodyClass?: string;
}

/**
 * The thambura's controls, wherever the layout puts them: a header with the
 * start/stop button, the Sound menu (built-in sounds and saved presets, which
 * play as soon as they're picked), the switch between the views, Copy link
 * (with `shareUrl`) and, in a drawer, Hide; then any notice, then the view.
 * ThamburaBar slides it up from the bottom of the window; ThamburaDocked puts
 * it in a slot on the page.
 */
export function ThamburaPanel(props: ThamburaPanelProps) {
  const st = () => props.state();
  const a = props.actions;
  const [copied, setCopied] = createSignal<"" | "Link copied" | "Copy the address bar instead">("");
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(copiedTimer));
  const copy = async () => {
    const ok = props.shareUrl ? await copyText(props.shareUrl(a.shareLink())) : false;
    setCopied(ok ? "Link copied" : "Copy the address bar instead");
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => setCopied(""), 2500);
  };

  return (
    <>
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
        <Show when={props.onHide}>
          <button
            type="button"
            aria-label="Hide thambura"
            onClick={() => props.onHide?.()}
            class="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06z" clip-rule="evenodd" />
            </svg>
          </button>
        </Show>
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
      <div class={props.bodyClass ?? "p-3 sm:p-4"}>
        <Switch>
          <Match when={st().view === "mini"}>
            <ThamburaMini state={props.state} actions={a} />
          </Match>
          <Match when={st().view === "studio"}>
            <ThamburaStudio state={props.state} actions={a} />
          </Match>
          <Match when={st().view === "raagini"}>
            <Suspense fallback={<ViewLoading name="Raagini" />}>
              <ThamburaRaagini state={props.state} actions={a} />
            </Suspense>
          </Match>
          <Match when={st().view === "lab"}>
            <Suspense fallback={<ViewLoading name="Lab" />}>
              <ThamburaLab state={props.state} actions={a} shareUrl={props.shareUrl} analyser={props.analyser} />
            </Suspense>
          </Match>
        </Switch>
      </div>
    </>
  );
}

/**
 * The panel docked in a page slot rather than a drawer: always showing, no
 * hide button, and as tall as its view.
 */
export function ThamburaDocked(props: ThamburaViewProps) {
  return (
    <div role="region" aria-label="Thambura" class="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 print:hidden">
      <ThamburaPanel {...props} />
    </div>
  );
}
