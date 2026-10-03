import type { EventBus, LCMComponent, Registry } from "@panyam/tsappkit";
import { decodeHands, decodeKit, decodeSession, encodeHands, encodeKit } from "../engine/shareLink";
import { AudioEngine } from "./audio";
import { HandsPresenter } from "./handsPresenter";
import { createPlayerIsland, newHandsPresenter, newKitPresenter, newPlayerPresenter } from "./island";
import { KeepAwake, usePlaybackSession, type WakeLockLike } from "./keepAwake";
import { KitPresenter } from "./kitPresenter";
import { createClock, Shruthi, Tracks, type Instrument, type PageContext } from "./pageContext";
import type { PageLink } from "./pageLink";
import type { PlayerPresenter } from "./presenter";
import { createSessionIsland } from "./sessionIsland";
import { createTracksIsland } from "./tracksIsland";
import { SessionPresenter, startingPitch } from "./session";
import type { Spec } from "./spec";
import type { Storage, Store } from "./storage";
import { TrackList, type CatalogEntry, type Made, type Placed } from "./trackList";
import { createThamburaIsland, newPluckRenderer, newThamburaPresenter } from "./thamburaIsland";
import type { PluckRenderer } from "./pluckRenderer";
import { ThamburaPresenter } from "./thamburaPresenter";
import { workerTicker } from "./transport";

// The tala's sounds and images, from the root, so the same string works on
// our pages and, resolved against embed.js, on anyone else's.
const FIXTURES = "/static/Resources/TalasFixtures.json";

/**
 * The islands a Thambura page can mount, by the names the page spec uses.
 * Both entries use it: app.js (main.ts) for our pages and embed.js
 * (embed.ts) for other sites.
 */
export function islandRegistry(): Registry<PageContext, HTMLElement, LCMComponent, EventBus> {
  return {
    tala: (el, island, ctx, bus) => {
      if (!ctx.tala) throw new Error("the page made no tala for its tala island");
      return createPlayerIsland(el, bus, {
        presenter: ctx.tala,
        audio: ctx.audio,
        fixturesUrl: new URL(typeof island.config.fixturesUrl === "string" ? island.config.fixturesUrl : FIXTURES, ctx.assetBase).href,
        kit: () => ctx.tracks.list().find((t): t is KitPresenter => t instanceof KitPresenter),
        onTracksChange: (f) => ctx.tracks.onChange(f),
        instrumentControls: island.config.instrumentControls !== false,
        wide: island.config.wide === true,
        hands: handsOf(ctx.tracks.get("hands-1")),
        session: ctx.session,
        onPlaying: (on) => ctx.awake.set("tala", on),
      });
    },
    // The speed and shruthi strip on its own, for a page whose tala doesn't
    // show it (a thambura-only embed); the tala island carries its own.
    session: (el, _island, ctx, bus) => createSessionIsland(el, bus, ctx.session),
    // The instruments on the page, as cards with Add and Remove (#101).
    tracks: (el, _island, ctx, bus) => createTracksIsland(el, bus, ctx),
    // Docked in a slot of its own (layouts/SideBySide.html, and embeds). A
    // page with a track list shows the thambura in its card instead.
    thambura: (el, _island, ctx, bus) => {
      const thambura = thamburaOf(ctx.tracks.get("thambura-1"));
      if (!thambura) throw new Error("the page has no thambura-1 for its thambura island");
      return createThamburaIsland(el, bus, thambura, ctx.audio, ctx.link);
    },
  };
}

/**
 * The page's shared services, and the instruments it starts with (the track
 * list decides which, trackList.ts). `assetBase` is what the spec's URLs
 * resolve against (PageContext), and `link` is where the instruments keep
 * the page's share link. `storage` is where everything on the page saves:
 * pageStorage on our pages, embedStorage on someone else's (#144).
 */
export function buildContext(spec: Spec, assetBase: string, link: PageLink, storage: Storage): PageContext {
  usePlaybackSession(navigator as { audioSession?: { type: string } });
  const audio = new AudioEngine();
  const clock = createClock(audio, workerTicker());
  const tracks = new Tracks<Instrument>();
  const opened = { session: link.opened("session-1"), thambura: link.opened("thambura-1") };
  const shruthi = new Shruthi(
    startingPitch(opened, loadQuietly(storage.store("shruthi")), loadQuietly(storage.instrument("thambura-1"))),
    storage.store("shruthi"),
  );
  const resolve = (url: string) => new URL(url, assetBase).href;
  const awake = new KeepAwake({ wakeLock: (navigator as { wakeLock?: WakeLockLike }).wakeLock, doc: document });

  // Each instrument as the track list makes it: on its audio track, the
  // clock and the shruthi, with its part of the page link, and how to take
  // all of that back off the page.
  // One renderer for every thambura on the page, made with the first.
  let renderer: PluckRenderer | undefined;
  const make = (p: Placed, entry: CatalogEntry): Made<Instrument> => {
    if (p.kind === "thambura") {
      // The thambura plays to the page's shruthi, moves it, and keeps its own link part.
      renderer ??= newPluckRenderer();
      const thambura = newThamburaPresenter(audio, p.id, link, storage, shruthi, renderer);
      // A thambura playing keeps the screen on, wherever the page shows it.
      let live = true;
      thambura.watch((st) => live && awake.set(p.id, st.playing));
      return {
        instrument: thambura,
        dispose: () => {
          thambura.dispose();
          awake.set(p.id, false);
          live = false;
        },
      };
    }
    if (p.kind === "hands") {
      // The claps: the tala calls each sound on the clock, and they play it.
      const claps = newHandsPresenter(audio, p.id, clock, storage);
      const shared = decodeHands(link.opened(p.id) ?? "");
      if (shared) claps.applyShared(shared);
      void claps.load(resolve(entry.config.fixturesUrl as string));
      const stop = keepPart(link, p.id, (write) =>
        claps.watch((s) => s.status === "ready" && write(encodeHands({ soundGroup: s.soundGroup, volume: s.volume }))),
      );
      return { instrument: claps, dispose: stop };
    }
    const kit = newKitPresenter(audio, p.id, storage, clock);
    const shared = decodeKit(link.opened(p.id) ?? "");
    if (shared) kit.applyShared(shared);
    const unfollow = shruthi.follow(() => kit.setTonic(shruthi.hz));
    void kit.load(resolve(entry.config.url as string));
    const stop = keepPart(link, p.id, (write) => {
      const encode = (s: KitPresenter["state"]) => write(encodeKit({ kit: p.kit ?? 0, variety: s.variety, volume: s.volume, enabled: s.enabled }));
      encode(kit.state);
      kit.watch(encode);
    });
    return {
      instrument: kit,
      dispose: () => {
        stop();
        unfollow();
        kit.dispose();
      },
    };
  };
  const trackList = new TrackList<Instrument>({
    catalog: catalogOf(spec),
    make,
    tracks,
    audio,
    link,
    kitOf: (part) => decodeKit(part)?.kit ?? null,
    // Only a page that shows the list remembers it; `/` starts with the spec's instruments.
    store: spec.islands.some((i) => i.name === "tracks") ? storage.store("tracks") : undefined,
    records: {
      load: (id) => storage.instrument(id).load(),
      save: (id, value) => storage.instrument(id).save(value),
      clear: (id) => storage.clear(id),
    },
    defer: (cb, ms) => {
      const t = setTimeout(cb, ms);
      return () => clearTimeout(t);
    },
  });

  // The tala, made here rather than by its island so the session strip and
  // the page link have it from the start. A shared link's tala and speed
  // play without being saved, as a shared thambura's setup does.
  let tala: PlayerPresenter | undefined;
  if (spec.islands.some((i) => i.name === "tala")) {
    tala = newPlayerPresenter(audio, clock, storage);
    const shared = opened.session && decodeSession(opened.session);
    if (shared) tala.applyShared(shared.tala, shared.tempo);
  }
  const session = new SessionPresenter({
    shruthi,
    tala,
    thamburas: () => tracks.list().filter((t): t is ThamburaPresenter => t instanceof ThamburaPresenter),
    kits: () => tracks.list().filter((t): t is KitPresenter => t instanceof KitPresenter),
    link: link.part("session-1"),
  });
  tracks.onChange(() => session.tracksChanged());
  return {
    audio,
    clock,
    tracks,
    trackList,
    shruthi,
    tala,
    session,
    awake,
    link,
    assetBase,
  };
}

/** What the page can put on it: the spec's instruments that have what they need. */
function catalogOf(spec: Spec): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const i of spec.instruments) {
    const added = i.added === true ? { added: true } : {};
    if (i.kind === "hands" && typeof i.config.fixturesUrl === "string") out.push({ kind: "hands", config: i.config, ...added });
    if (i.kind === "thambura") out.push({ kind: "thambura", config: i.config, ...added });
    if (i.kind === "kit" && typeof i.config.url === "string") out.push({ kind: "kit", config: i.config, ...added });
  }
  return out;
}

/**
 * Keeps `id`'s part of the page link: `start` is handed a writer that skips
 * a part that hasn't changed. The returned stop makes later writes do
 * nothing, since an instrument leaving the page can still finish loading.
 */
function keepPart(link: PageLink, id: string, start: (write: (part: string) => void) => void): () => void {
  let live = true;
  let last = "";
  const part = link.part(id);
  start((p) => {
    if (!live || p === last) return;
    last = p;
    part.write(p);
  });
  return () => {
    live = false;
  };
}

/** A saved record, or null if there's none or it can't be read. */
function loadQuietly(store: Store): unknown {
  try {
    return store.load();
  } catch {
    return null;
  }
}

function thamburaOf(track: Instrument | undefined): ThamburaPresenter | undefined {
  return track instanceof ThamburaPresenter ? track : undefined;
}

function handsOf(track: Instrument | undefined): HandsPresenter | undefined {
  return track instanceof HandsPresenter ? track : undefined;
}
