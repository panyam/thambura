import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import type { ThamburaSettings } from "../engine/shruthi";
import type { AudioEngine } from "./audio";
import { isThamburaShortcut } from "./shortcuts";
import { ThamburaBar } from "./ThamburaBar";
import { ThamburaPresenter, type ThamburaLink, type ThamburaState, type ThamburaStore } from "./thamburaPresenter";
import { workerTicker } from "./transport";

const STORAGE_KEY = "thambura.drone";
const PRESETS_KEY = "thambura.presets";
// The query parameter that carries a shared setup (engine/shareLink.ts).
const LINK_PARAM = "s";
// Address bar updates wait for this long after the last change: Safari throws
// if replaceState is called more than 100 times in 30 s, and a slider drag
// changes the setup on every step.
const LINK_SETTLE_MS = 400;

/**
 * Mounts the thambura bar on `el` and wires the page's floating thambura
 * controls: `play` starts and stops it from anywhere on the page, as does the
 * T key, and `toggle` opens and closes the bar. It plays through the page's
 * shared AudioEngine, on the drone bus. `onPlaying` hears whenever it starts
 * or stops.
 */
export function createThamburaIsland(
  el: HTMLElement,
  eventBus: EventBus,
  audio: AudioEngine,
  controls: { root: HTMLElement | null; toggle: HTMLElement | null; play: HTMLElement | null },
  onPlaying?: (playing: boolean) => void,
  /** Hears every settings change, so the mridangam can tune to the same Sa. */
  onSettings?: (settings: ThamburaSettings) => void,
): SolidIsland {
  const { toggle, play } = controls;
  const presenter = new ThamburaPresenter({
    audio,
    ticker: workerTicker(),
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
    defer: (cb, ms) => setTimeout(cb, ms),
    store: localStore(STORAGE_KEY),
    presets: localStore(PRESETS_KEY),
    link: addressBarLink(),
  });
  const [state, setState] = signalView(presenter.state);
  presenter.attach({
    setState(s) {
      setState(s);
      reflect(controls, s);
      onPlaying?.(s.playing);
      onSettings?.(s.settings);
    },
  });
  toggle?.addEventListener("click", () => presenter.toggleOpen());
  play?.addEventListener("click", () => void presenter.toggle());
  document.addEventListener("keydown", (e) => {
    if (!isThamburaShortcut(e as KeyboardEvent & { target: HTMLElement | null })) return;
    e.preventDefault();
    void presenter.toggle();
  });

  // Leave room at the bottom of the page for the open bar.
  const onHeight = (px: number) => document.documentElement.style.setProperty("--thambura-bar-height", `${px}px`);

  return new SolidIsland(
    "thambura",
    el,
    () => (
      <ThamburaBar state={state} actions={presenter} onHeight={onHeight} shareUrl={linkUrl} analyser={() => audio.analyser("drone")} />
    ),
    eventBus,
  );
}

/** Shows on the floating buttons whether the thambura is playing and the bar open. */
function reflect(controls: { root: HTMLElement | null; toggle: HTMLElement | null; play: HTMLElement | null }, s: ThamburaState): void {
  // The open bar carries its own play and hide buttons, and on a phone it
  // leaves no room below it, so the floating pair fades out while it's open.
  const root = controls.root;
  if (root) {
    root.classList.toggle("opacity-0", s.open);
    root.classList.toggle("translate-y-6", s.open);
    root.inert = s.open;
  }
  const toggle = controls.toggle;
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(s.open));
    toggle.setAttribute("aria-label", s.open ? "Hide the shruthi box" : "Shruthi box");
    toggle.title = s.open ? "Hide the shruthi box" : "Show the shruthi box";
  }
  const play = controls.play;
  if (!play) return;
  play.dataset.playing = String(s.playing);
  play.setAttribute("aria-pressed", String(s.playing));
  play.setAttribute("aria-label", s.playing ? "Stop thambura" : "Start thambura");
  play.title = s.playing ? "Stop the thambura (T)" : "Start the thambura (T)";
}

/**
 * The `s` parameter of the address bar, kept current without adding history
 * entries. Other parameters on the page are left as they are.
 */
function addressBarLink(): ThamburaLink {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    read: () => new URLSearchParams(location.search).get(LINK_PARAM),
    write: (link) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const url = linkUrl(link);
        if (url !== location.href) history.replaceState(history.state, "", url);
      }, LINK_SETTLE_MS);
    },
  };
}

function linkUrl(link: string): string {
  const url = new URL(location.href);
  url.searchParams.set(LINK_PARAM, link);
  return url.toString();
}

/** localStorage under one key, as JSON. Throws are caught by the presenter. */
function localStore(key: string): ThamburaStore {
  return {
    load: () => JSON.parse(localStorage.getItem(key) ?? "null"),
    save: (v) => localStorage.setItem(key, JSON.stringify(v)),
  };
}
