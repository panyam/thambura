import { createEffect, Match, onCleanup, onMount, Switch } from "solid-js";
import { THAMBURA_VIEWS } from "./thamburaPresenter";
import { Segmented, type ThamburaViewProps } from "./thamburaControls";
import { ThamburaMini } from "./ThamburaMini";
import { ThamburaRaagini } from "./ThamburaRaagini";
import { ThamburaStudio } from "./ThamburaStudio";

/**
 * The floating thambura bar. It slides up from the bottom of the window when
 * open and holds a switch between the views, all of which drive the same
 * presenter. `onHeight` reports the space it covers (0 when hidden) so the
 * page can leave room for it.
 */
export function ThamburaBar(props: ThamburaViewProps & { onHeight?: (px: number) => void }) {
  const st = () => props.state();
  const a = props.actions;
  let panel!: HTMLDivElement;

  const report = () => props.onHeight?.(st().open ? panel.offsetHeight : 0);
  onMount(() => {
    const ro = new ResizeObserver(report);
    ro.observe(panel);
    onCleanup(() => ro.disconnect());
  });
  createEffect(() => {
    // A hidden bar keeps its controls out of the tab order and away from screen readers.
    panel.inert = !st().open;
    report();
  });

  return (
    <div class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 sm:px-4 print:hidden">
      <div
        ref={panel}
        role="region"
        aria-label="Thambura"
        class={`pointer-events-auto w-full max-w-3xl rounded-t-2xl border border-b-0 border-gray-200 bg-white/95 backdrop-blur transition-[transform,box-shadow] duration-300 ease-out dark:border-gray-700 dark:bg-gray-900/95 ${
          st().open ? "translate-y-0 shadow-[0_-8px_30px_rgba(0,0,0,0.15)]" : "translate-y-[110%] shadow-none"
        }`}
      >
        <div class="flex items-center gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <span class="hidden text-sm font-semibold sm:inline">Thambura</span>
          <Segmented label="Thambura view" size="sm" value={st().view} options={THAMBURA_VIEWS.map((v) => ({ value: v.id, label: v.label }))} onChange={(v) => a.setView(v)} />
          <button
            type="button"
            aria-label="Hide thambura"
            onClick={() => a.setOpen(false)}
            class="ml-auto rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
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
          </Switch>
        </div>
      </div>
    </div>
  );
}
