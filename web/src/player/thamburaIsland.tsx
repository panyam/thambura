import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
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
 * Mounts the thambura bar on `el` and wires the site header's thambura
 * buttons: `play` starts and stops it from anywhere on the page, as does the
 * T key, and `toggle` opens and closes the bar. It plays through the page's
 * shared AudioEngine, on the drone bus. `onPlaying` hears whenever it starts
 * or stops.
 */
export function createThamburaIsland(
  el: HTMLElement,
  eventBus: EventBus,
  audio: AudioEngine,
  header: { toggle: HTMLElement | null; play: HTMLElement | null },
  onPlaying?: (playing: boolean) => void,
): SolidIsland {
  const { toggle, play } = header;
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
      reflect(header, s);
      onPlaying?.(s.playing);
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

/** Shows on the header's buttons whether the thambura is playing and the bar open. */
function reflect(header: { toggle: HTMLElement | null; play: HTMLElement | null }, s: ThamburaState): void {
  header.toggle?.setAttribute("aria-expanded", String(s.open));
  const play = header.play;
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
