import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import type { AudioEngine } from "./audio";
import { ThamburaBar } from "./ThamburaBar";
import { ThamburaPresenter, type ThamburaState, type ThamburaStore } from "./thamburaPresenter";
import { workerTicker } from "./transport";

const STORAGE_KEY = "sadhana.thambura";

/**
 * Mounts the thambura bar on `el` and wires the header's thambura button
 * (`toggle`) to open and close it. It plays through the page's shared
 * AudioEngine, on the drone bus. `onPlaying` hears whenever it starts or stops.
 */
export function createThamburaIsland(
  el: HTMLElement,
  eventBus: EventBus,
  audio: AudioEngine,
  toggle: HTMLElement | null,
  onPlaying?: (playing: boolean) => void,
): SolidIsland {
  const presenter = new ThamburaPresenter({
    audio,
    ticker: workerTicker(),
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
    defer: (cb, ms) => setTimeout(cb, ms),
    store: localStore(STORAGE_KEY),
  });
  const [state, setState] = signalView(presenter.state);
  presenter.attach({
    setState(s) {
      setState(s);
      if (toggle) reflect(toggle, s);
      onPlaying?.(s.playing);
    },
  });
  toggle?.addEventListener("click", () => presenter.toggleOpen());

  // Leave room at the bottom of the page for the open bar.
  const onHeight = (px: number) => document.documentElement.style.setProperty("--thambura-bar-height", `${px}px`);

  return new SolidIsland(
    "thambura",
    el,
    () => <ThamburaBar state={state} actions={presenter} onHeight={onHeight} />,
    eventBus,
  );
}

/** Shows on the header button whether the bar is open and the thambura playing. */
function reflect(toggle: HTMLElement, s: ThamburaState): void {
  toggle.setAttribute("aria-expanded", String(s.open));
  toggle.querySelector("[data-playing]")?.classList.toggle("hidden", !s.playing);
}

/** localStorage under one key, as JSON. Throws are caught by the presenter. */
function localStore(key: string): ThamburaStore {
  return {
    load: () => JSON.parse(localStorage.getItem(key) ?? "null"),
    save: (v) => localStorage.setItem(key, JSON.stringify(v)),
  };
}
