import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import { createSignal } from "solid-js";
import type { ThamburaSettings } from "../engine/shruthi";
import type { AudioEngine } from "./audio";
import { isThamburaShortcut } from "./shortcuts";
import { ThamburaBar } from "./ThamburaBar";
import { linkShowsBar, ThamburaDrawer } from "./thamburaDrawer";
import { ThamburaDocked } from "./ThamburaPanel";
import type { PageLink } from "./pageLink";
import { browserPluckRenderer } from "./pluckRenderer";
import { instrumentStore, localStore, withFallback } from "./storage";
import { ThamburaPresenter, type ThamburaState } from "./thamburaPresenter";
import { workerTicker } from "./transport";

/**
 * Mounts a view of `presenter`, the page's thambura, on `el`, in a drawer or
 * docked (`presentation`). The page makes the presenter; this is only where
 * it's shown. In a drawer it also wires the page's floating thambura
 * controls: `play` starts and stops it from anywhere on the page, as does
 * the T key, and `toggle` opens and closes the bar. The bar's open state is
 * the drawer's; the presenter never sees it, so the drawer tells the page's
 * link (`link.showsBar`), which adds it on the way to the address bar.
 * `onPlaying` hears whenever it starts or stops.
 */
/** How the thambura is shown: in a drawer with the page's floating controls, or docked in its slot. */
export type ThamburaPresentation = "drawer" | "panel";

export interface ThamburaIslandOptions {
  presentation: ThamburaPresentation;
  /** The page's floating play and toggle buttons, for the drawer. A docked thambura has none. */
  controls?: { root: HTMLElement | null; toggle: HTMLElement | null; play: HTMLElement | null };
  /** Hears whenever it starts or stops. */
  onPlaying?: (playing: boolean) => void;
  /** Hears every settings change, so the mridangam can tune to the same Sa. */
  onSettings?: (settings: ThamburaSettings) => void;
  /**
   * Whether the T key anywhere on the page starts and stops it. Off when the
   * thambura is on someone else's page (embed.ts): the page isn't ours to
   * take keys from.
   */
  pageKeys?: boolean;
}

export function createThamburaIsland(
  el: HTMLElement,
  eventBus: EventBus,
  presenter: ThamburaPresenter,
  audio: AudioEngine,
  link: PageLink,
  opts: ThamburaIslandOptions,
): SolidIsland {
  const { onPlaying, onSettings } = opts;
  const controls = opts.controls ?? { root: null, toggle: null, play: null };
  const { toggle, play } = controls;
  // Only a drawer has an open state; a docked thambura is always showing.
  const drawer =
    opts.presentation === "drawer" ? new ThamburaDrawer({ store: localStore("drawer"), legacy: localStore("drone"), link: link.opened(presenter.id) }) : null;
  link.showsBar = () => linkShowsBar(opts.presentation, drawer);
  // The presenter wrote the link before this layout was mounted; write it again with the bar's flag.
  link.part(presenter.id).write(presenter.shareLink());
  const [open, setOpen] = createSignal(drawer?.open ?? true);
  const [state, setState] = signalView(presenter.state);
  presenter.attach({
    setState(s) {
      setState(s);
      reflectPlaying(play, s);
      onPlaying?.(s.playing);
      onSettings?.(s.settings);
    },
  });
  if (drawer) {
    drawer.onChange((o) => {
      setOpen(o);
      reflectOpen(controls, o);
      link.part(presenter.id).write(presenter.shareLink());
    });
    reflectOpen(controls, drawer.open);
    toggle?.addEventListener("click", () => drawer.toggle());
  }
  play?.addEventListener("click", () => void presenter.toggle());
  if (opts.pageKeys !== false) document.addEventListener("keydown", (e) => {
    if (!isThamburaShortcut(e as KeyboardEvent & { target: HTMLElement | null })) return;
    e.preventDefault();
    void presenter.toggle();
  });

  // Leave room at the bottom of the page for the open bar.
  const onHeight = (px: number) => document.documentElement.style.setProperty("--thambura-bar-height", `${px}px`);
  const shareUrl = (setup: string) => link.url(presenter.id, setup);
  const analyser = () => audio.analyser(presenter.id);

  return new SolidIsland(
    "thambura",
    el,
    () =>
      drawer ? (
        <ThamburaBar
          state={state}
          actions={presenter}
          open={open}
          onHide={() => drawer.setOpen(false)}
          onHeight={onHeight}
          shareUrl={shareUrl}
          analyser={analyser}
        />
      ) : (
        <ThamburaDocked state={state} actions={presenter} shareUrl={shareUrl} analyser={analyser} />
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
 * A thambura on the page's audio, as the instrument with this `id`
 * (`thambura-1`), reading and writing the page's share link. The first
 * thambura takes the setup it saved before instance ids, once.
 */
export function newThamburaPresenter(audio: AudioEngine, id: string, link: PageLink): ThamburaPresenter {
  const own = instrumentStore(id);
  const defer = (cb: () => void, ms: number) => {
    const t = setTimeout(cb, ms);
    return () => clearTimeout(t);
  };
  return new ThamburaPresenter({
    id,
    audio,
    ticker: workerTicker(),
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (frame) => cancelAnimationFrame(frame),
    },
    defer,
    renderer: browserPluckRenderer(defer),
    store: id === "thambura-1" ? withFallback(own, localStore("drone")) : own,
    presets: localStore("presets"),
    link: link.part(id),
  });
}
