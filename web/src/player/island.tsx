import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import { createSignal } from "solid-js";
import { REST } from "../engine/motion";
import type { AudioEngine } from "./audio";
import { KitPresenter } from "./kitPresenter";
import { PlayerPresenter } from "./presenter";
import type { Clock } from "./pageContext";
import { PlayerView } from "./PlayerView";
import { localStore } from "./storage";

const DEFAULT_FIXTURES_URL = "/static/Resources/TalasFixtures.json";

export interface PlayerIslandDeps {
  audio: AudioEngine;
  /** The page's clock; the tala plays on it and sets its tempo. */
  clock: Clock;
  /** The tala's sound and image groups, from the page spec's config. */
  fixturesUrl?: string;
  /**
   * The struck instrument the tala plays its pattern on, from the page's
   * tracks. The page loads it; its pad shows once a kit has loaded.
   * TODO(instruments): the tala stops knowing about kits once stroke
   * scheduling moves into a kit track.
   */
  kit?: KitPresenter;
  /** Hears whenever the tala starts or stops. */
  onPlaying?: (playing: boolean) => void;
}

/**
 * Wires the real browser pieces (the page's AudioEngine and clock, animation
 * frames, fetch) into a presenter and mounts its view on `el`.
 */
export function createPlayerIsland(el: HTMLElement, eventBus: EventBus, deps: PlayerIslandDeps): SolidIsland {
  const { audio, onPlaying } = deps;
  // A page with no kit still gets an idle one, so the view has something to show (nothing).
  const drum = deps.kit ?? newKitPresenter(audio);

  const presenter = new PlayerPresenter({
    audio,
    strokes: drum,
    clock: deps.clock,
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
    fetchJson,
    preloadImages,
    store: localStore("player"),
  });
  const [drumState, setDrumState] = signalView(drum.state);
  drum.attach({ setState: setDrumState });

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
    () => <PlayerView state={state} pose={pose} actions={presenter} kit={{ state: drumState, actions: drum }} />,
    eventBus,
  );
}

/** A kit presenter on the page's audio, with nothing loaded. */
export function newKitPresenter(audio: AudioEngine): KitPresenter {
  return new KitPresenter({
    audio,
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
