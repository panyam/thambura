import { createEffect, onCleanup, onMount } from "solid-js";
import type { ThamburaViewProps } from "./thamburaControls";
import { ThamburaPanel } from "./ThamburaPanel";

/**
 * The floating thambura bar: ThamburaPanel in a drawer that slides up from
 * the bottom of the window when open. `open` says whether it is showing (the
 * drawer's state, not the presenter's) and `onHide` is its hide button.
 * `onHeight` reports the space it covers (0 when hidden) so the page can
 * leave room for it.
 */
export function ThamburaBar(props: ThamburaViewProps & { open: () => boolean; onHide: () => void; onHeight?: (px: number) => void }) {
  const st = () => props.state();
  let panel!: HTMLDivElement;

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
        <ThamburaPanel {...props} bodyClass="max-h-[70vh] overflow-y-auto p-3 sm:p-4" />
      </div>
    </div>
  );
}
