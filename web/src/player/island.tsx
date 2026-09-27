import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import { createSignal } from "solid-js";
import { REST } from "../engine/motion";
import type { AudioEngine } from "./audio";
import { HandsPresenter } from "./handsPresenter";
import { KitPresenter } from "./kitPresenter";
import { PlayerPresenter } from "./presenter";
import type { Clock } from "./pageContext";
import { PlayerView } from "./PlayerView";
import { watched } from "./watched";
import type { SessionPresenter, SessionState } from "./session";
import { instrumentStore, localStore } from "./storage";

const DEFAULT_FIXTURES_URL = "/static/Resources/TalasFixtures.json";

export interface PlayerIslandDeps {
  /** The page's tala (PageContext.tala), which this island shows. */
  presenter: PlayerPresenter;
  audio: AudioEngine;
  /** The tala's sound and image groups, from the page spec's config. */
  fixturesUrl?: string;
  /**
   * The struck instrument on the page now, if any, for the view only: its
   * stroke lane (and its pad, see `instrumentControls`) sit with the tala. It
   * plays along on the page's clock by itself; the tala doesn't know it's
   * there. `onTracksChange` says when to ask again, as the track list adds
   * and removes one.
   */
  kit?: () => KitPresenter | undefined;
  onTracksChange?: (f: () => void) => void;
  /**
   * Whether the instruments' own controls (the claps' Sounds and Volume, the
   * kit's pad) sit with the tala. A page with a track list shows them in the
   * instruments' tracks instead; the stroke lane stays under the image.
   */
  instrumentControls?: boolean;
  /** Lays the tala out across a page-wide panel (PlayerView's `wide`). */
  wide?: boolean;
  /**
   * The hand claps from the page's tracks, for the view only: their Sounds
   * menu and Volume sit with the tala. They play the tala's calls from the
   * page's clock by themselves.
   */
  hands?: HandsPresenter;
  /** The page's speed and shruthi, shown as a strip under the beat image. */
  session?: SessionPresenter;
  /** Hears whenever the tala starts or stops. */
  onPlaying?: (playing: boolean) => void;
}

/**
 * The tala on the page's audio and clock, with the real browser pieces
 * (animation frames, fetch, image preloading) and its saved choices.
 */
export function newPlayerPresenter(audio: AudioEngine, clock: Clock): PlayerPresenter {
  return new PlayerPresenter({
    audio,
    clock,
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
    fetchJson,
    preloadImages,
    store: localStore("player"),
  });
}

/** Mounts the page's tala on `el`, with its fixture of images loading. */
export function createPlayerIsland(el: HTMLElement, eventBus: EventBus, deps: PlayerIslandDeps): SolidIsland {
  const { audio, onPlaying, presenter } = deps;
  const session = deps.session;
  let sessionView: { state: () => SessionState; actions: SessionPresenter } | undefined;
  if (session) {
    const [sessionState, setSessionState] = signalView(session.state);
    session.attach({ setState: setSessionState });
    sessionView = { state: sessionState, actions: session };
  }
  // The kit follows the page's tracks: the track list can add or remove it.
  let shown: KitPresenter | undefined;
  const [kitView, setKitView] = createSignal<{ state: () => KitPresenter["state"]; actions: KitPresenter } | undefined>();
  const followKit = () => {
    const kit = deps.kit?.();
    if (kit === shown) return;
    shown = kit;
    setKitView(kit ? { state: watched(kit), actions: kit } : undefined);
  };
  followKit();
  deps.onTracksChange?.(followKit);
  const hands = deps.hands;
  const handsView = hands ? { state: watched(hands), actions: hands } : undefined;

  const [state, setState] = signalView(presenter.state);
  const [pose, setPose] = createSignal(REST);
  presenter.attach({
    setState(s) {
      setState(s);
      onPlaying?.(s.playing);
    },
    setPose,
  });
  void presenter.load(deps.fixturesUrl || DEFAULT_FIXTURES_URL);

  // Drop the <noscript> fallback; the island owns the element's children.
  el.replaceChildren();
  return new SolidIsland(
    "player",
    el,
    () => <PlayerView state={state} pose={pose} actions={presenter} kit={kitView()} instrumentControls={deps.instrumentControls !== false} wide={deps.wide === true} hands={handsView} session={sessionView} />,
    eventBus,
  );
}

/**
 * The hand claps on the page's audio, playing the tala's calls from `clock`
 * on track `track`. Load the fixture's sound groups before they're heard.
 */
export function newHandsPresenter(audio: AudioEngine, track: string, clock: Clock): HandsPresenter {
  return new HandsPresenter({
    audio,
    track,
    clock,
    fetchJson,
    store: instrumentStore(track),
    legacyStore: localStore("player"),
  });
}

/**
 * A kit presenter on the page's audio, with nothing loaded, playing on track
 * `track`. Given the page's clock, it plays along with the tala.
 */
export function newKitPresenter(audio: AudioEngine, track: string, clock?: Clock): KitPresenter {
  return new KitPresenter({
    audio,
    track,
    clock,
    store: instrumentStore(track),
    legacyStore: localStore("player"),
    fetchJson,
    frames: { request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) },
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

/** Resolves once every image has loaded or failed, so the first beats don't flicker in. */
function preloadImages(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}
