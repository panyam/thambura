import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import { createSignal } from "solid-js";
import { withBarOpen } from "../engine/shareLink";
import type { ThamburaSettings } from "../engine/shruthi";
import type { AudioEngine } from "./audio";
import { isThamburaShortcut } from "./shortcuts";
import { ThamburaBar } from "./ThamburaBar";
import { ThamburaDrawer } from "./thamburaDrawer";
import { localStore } from "./storage";
import { ThamburaPresenter, type ThamburaLink, type ThamburaState } from "./thamburaPresenter";
import { workerTicker } from "./transport";

// The query parameter that carries a shared setup (engine/shareLink.ts).
const LINK_PARAM = "s";
// Address bar updates wait for this long after the last change: Safari throws
// if replaceState is called more than 100 times in 30 s, and a slider drag
// changes the setup on every step.
const LINK_SETTLE_MS = 400;

/**
 * Mounts the thambura bar on `el` and wires the page's floating thambura
 * controls: `play` starts and stops it from anywhere on the page, as does the
 * T key, and `toggle` opens and closes the bar. The bar's open state is the
 * drawer's; the presenter never sees it, so the link the presenter writes
 * gets the drawer's flag added here, on its way to the address bar. It plays
 * through the page's shared AudioEngine, on the drone bus. `onPlaying` hears
 * whenever it starts or stops.
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
  const address = addressBarLink();
  const drawer = new ThamburaDrawer({ store: localStore("drawer"), legacy: localStore("drone"), link: address.read() });
  const [open, setOpen] = createSignal(drawer.open);
  const presenter = new ThamburaPresenter({
    audio,
    ticker: workerTicker(),
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
    defer: (cb, ms) => setTimeout(cb, ms),
    store: localStore("drone"),
    presets: localStore("presets"),
    link: { read: address.read, write: (link) => address.write(withBarOpen(link, drawer.open)) },
  });
  const [state, setState] = signalView(presenter.state);
  presenter.attach({
    setState(s) {
      setState(s);
      reflectPlaying(play, s);
      onPlaying?.(s.playing);
      onSettings?.(s.settings);
    },
  });
  drawer.onChange((o) => {
    setOpen(o);
    reflectOpen(controls, o);
    address.write(withBarOpen(presenter.shareLink(), o));
  });
  reflectOpen(controls, drawer.open);
  toggle?.addEventListener("click", () => drawer.toggle());
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
      <ThamburaBar
        state={state}
        actions={presenter}
        open={open}
        onHide={() => drawer.setOpen(false)}
        onHeight={onHeight}
        shareUrl={(link) => linkUrl(withBarOpen(link, drawer.open))}
        analyser={() => audio.analyser("drone")}
      />
    ),
    eventBus,
  );
}

/** Shows on the floating buttons whether the bar is open. */
function reflectOpen(controls: { root: HTMLElement | null; toggle: HTMLElement | null }, open: boolean): void {
  // The open bar carries its own play and hide buttons, and on a phone it
  // leaves no room below it, so the floating pair fades out while it's open.
  const root = controls.root;
  if (root) {
    root.classList.toggle("opacity-0", open);
    root.classList.toggle("translate-y-6", open);
    root.inert = open;
  }
  const toggle = controls.toggle;
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Hide the shruthi box" : "Shruthi box");
    toggle.title = open ? "Hide the shruthi box" : "Show the shruthi box";
  }
}

/** Shows on the floating play button whether the thambura is playing. */
function reflectPlaying(play: HTMLElement | null, s: ThamburaState): void {
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
