import type { AudioEngine } from "./audio";
import { HandsPresenter } from "./handsPresenter";
import { KitPresenter } from "./kitPresenter";
import { PlayerPresenter } from "./presenter";
import type { Clock } from "./pageContext";
import type { Storage } from "./storage";

/**
 * The tala on the page's audio and clock, with the real browser pieces
 * (animation frames, fetch, image preloading) and its saved choices.
 */
export function newPlayerPresenter(audio: AudioEngine, clock: Clock, storage: Storage): PlayerPresenter {
  return new PlayerPresenter({
    audio,
    clock,
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
    fetchJson,
    preloadImages,
    store: storage.store("player"),
  });
}

/**
 * The hand claps on the page's audio, playing the tala's calls from `clock`
 * on track `track`. Load the fixture's sound groups before they're heard.
 */
export function newHandsPresenter(audio: AudioEngine, track: string, clock: Clock, storage: Storage): HandsPresenter {
  return new HandsPresenter({
    audio,
    track,
    clock,
    fetchJson,
    store: storage.instrument(track),
    legacyStore: storage.store("player"),
  });
}

/**
 * A kit presenter on the page's audio, with nothing loaded, playing on track
 * `track`. Given the page's clock, it plays along with the tala.
 */
export function newKitPresenter(audio: AudioEngine, track: string, storage: Storage, clock?: Clock): KitPresenter {
  return new KitPresenter({
    audio,
    track,
    clock,
    store: storage.instrument(track),
    legacyStore: storage.store("player"),
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
