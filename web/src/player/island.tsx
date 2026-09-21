import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import { createSignal } from "solid-js";
import { REST } from "../engine/motion";
import type { AudioEngine } from "./audio";
import { KitPresenter } from "./kitPresenter";
import { PlayerPresenter } from "./presenter";
import { PlayerView } from "./PlayerView";
import { workerTicker } from "./transport";

const DEFAULT_FIXTURES_URL = "/static/Resources/TalasFixtures.json";
const STORAGE_KEY = "thambura.player";

/**
 * Wires the real browser pieces (the page's AudioEngine, a worker ticker,
 * animation frames, fetch) into a presenter and mounts its view on `el`. The
 * page shell names the fixtures file in `data-fixtures-url` and the mridangam
 * kit in `data-kit-url`. `onPlaying` hears whenever the tala starts or stops.
 *
 * A struck instrument (the mridangam today) rides along here because it will
 * share the tala's transport once it has a sequencer. Its pad only appears
 * once a kit loads, and no kit is committed yet, so on a plain clone the page
 * is unchanged.
 */
export function createPlayerIsland(
  el: HTMLElement,
  eventBus: EventBus,
  audio: AudioEngine,
  onPlaying?: (playing: boolean) => void,
  kit?: KitPresenter,
): SolidIsland {
  const presenter = new PlayerPresenter({
    audio,
    ticker: workerTicker(),
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
    fetchJson,
    preloadImages,
    store: {
      load: () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"),
      save: (v) => localStorage.setItem(STORAGE_KEY, JSON.stringify(v)),
    },
  });
  const drum =
    kit ??
    new KitPresenter({
      audio,
      fetchJson,
      frames: { request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) },
    });
  const [drumState, setDrumState] = signalView(drum.state);
  drum.attach({ setState: setDrumState });
  // Only when the page shell says a kit is there, so a plain checkout doesn't
  // ask for one and get a 404.
  if (el.dataset.kitUrl) void drum.load(el.dataset.kitUrl);

  const [state, setState] = signalView(presenter.state);
  const [pose, setPose] = createSignal(REST);
  presenter.attach({
    setState(s) {
      setState(s);
      onPlaying?.(s.playing);
    },
    setPose,
  });
  void presenter.load(el.dataset.fixturesUrl || DEFAULT_FIXTURES_URL);

  // Drop the <noscript> fallback; the island owns the element's children.
  el.replaceChildren();
  return new SolidIsland(
    "player",
    el,
    () => <PlayerView state={state} pose={pose} actions={presenter} kit={{ state: drumState, actions: drum }} />,
    eventBus,
  );
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
