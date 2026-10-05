import type { AudioEngine } from "./audio";
import type { PageLink } from "./pageLink";
import { CachedRenderer, pluckStore } from "./pluckCache";
import { browserPluckRenderer, type PluckRenderer } from "./pluckRenderer";
import { withFallback, type Storage } from "./storage";
import { thamburaInstance, ThamburaPresenter, type PitchSource } from "./thamburaPresenter";
import { workerTicker } from "./transport";

/** Runs `cb` after `ms`; returns a cancel. */
const defer = (cb: () => void, ms: number) => {
  const t = setTimeout(cb, ms);
  return () => clearTimeout(t);
};

/**
 * The page's pluck renderer, for every thambura on it: one pool of workers
 * and one cache, so two thamburas don't start eight workers between them.
 */
export function newPluckRenderer(): PluckRenderer {
  return new CachedRenderer(browserPluckRenderer(defer), pluckStore());
}

/**
 * A thambura on the page's audio, as the instrument with this `id`
 * (`thambura-1`, or `thambura-2` set up as the second: thamburaInstance),
 * reading and writing the page's share link, saving to `storage` (the page's
 * scope, storage.ts), and playing to the page's shruthi when given it. `renderer` is the page's, shared by its thamburas;
 * without one it makes its own. The first thambura takes the setup it saved
 * before instance ids, once.
 */
export function newThamburaPresenter(audio: AudioEngine, id: string, link: PageLink, storage: Storage, shruthi?: PitchSource, renderer: PluckRenderer = newPluckRenderer()): ThamburaPresenter {
  const own = storage.instrument(id);
  return new ThamburaPresenter({
    ...thamburaInstance(id),
    id,
    audio,
    ticker: workerTicker(),
    frames: {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (frame) => cancelAnimationFrame(frame),
    },
    defer,
    renderer,
    store: id === "thambura-1" ? withFallback(own, storage.store("drone")) : own,
    presets: storage.store("presets"),
    labPrefs: storage.store("lab"),
    link: link.part(id),
    shruthi,
  });
}
