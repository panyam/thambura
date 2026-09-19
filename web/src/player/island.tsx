import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import { createSignal } from "solid-js";
import type { AudioEngine } from "./audio";
import { PlayerPresenter } from "./presenter";
import { PlayerView } from "./PlayerView";
import { workerTicker } from "./transport";

const DEFAULT_FIXTURES_URL = "/static/Resources/TalasFixtures.json";

/**
 * Wires the real browser pieces (the page's AudioEngine, a worker ticker,
 * animation frames, fetch) into a presenter and mounts its view on `el`. The
 * page shell names the fixtures file in `data-fixtures-url`. `onPlaying` hears
 * whenever the tala starts or stops.
 */
export function createPlayerIsland(
  el: HTMLElement,
  eventBus: EventBus,
  audio: AudioEngine,
  onPlaying?: (playing: boolean) => void,
): SolidIsland {
  const presenter = new PlayerPresenter({
    audio,
    ticker: workerTicker(),
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
    fetchJson: async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    },
    preloadImages,
  });
  const [state, setState] = signalView(presenter.state);
  const [swing, setSwing] = createSignal(1);
  presenter.attach({
    setState(s) {
      setState(s);
      onPlaying?.(s.playing);
    },
    setSwing,
  });
  void presenter.load(el.dataset.fixturesUrl || DEFAULT_FIXTURES_URL);

  // Drop the <noscript> fallback; the island owns the element's children.
  el.replaceChildren();
  return new SolidIsland("player", el, () => <PlayerView state={state} swing={swing} actions={presenter} />, eventBus);
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
