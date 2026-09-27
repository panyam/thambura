import type { EventBus, LCMComponent } from "@panyam/tsappkit";
import { decodeSession } from "../engine/shareLink";
import type { Registry } from "../page/mount";
import type { PageSpec } from "../page/spec";
import { AudioEngine } from "./audio";
import { HandsPresenter } from "./handsPresenter";
import { createPlayerIsland, newHandsPresenter, newKitPresenter, newPlayerPresenter } from "./island";
import { KeepAwake, usePlaybackSession, type WakeLockLike } from "./keepAwake";
import { KitPresenter } from "./kitPresenter";
import { createClock, Shruthi, Tracks, type Instrument, type PageContext } from "./pageContext";
import type { PageLink } from "./pageLink";
import type { PlayerPresenter } from "./presenter";
import { createSessionIsland } from "./sessionIsland";
import { SessionPresenter, startingPitch } from "./session";
import { instrumentStore, localStore, type Store } from "./storage";
import { createThamburaIsland, newThamburaPresenter } from "./thamburaIsland";
import { ThamburaPresenter } from "./thamburaPresenter";
import { workerTicker } from "./transport";

// The tala's sounds and images, from the root, so the same string works on
// our pages and, resolved against embed.js, on anyone else's.
const FIXTURES = "/static/Resources/TalasFixtures.json";

/** How the islands are wired: on our own pages, or embedded in someone else's. */
export interface IslandsOptions {
  /**
   * Set for an embed (embed.ts). The thambura then always docks, since the
   * drawer's floating controls belong to our page chrome, and doesn't take
   * the T key from the host's page.
   */
  embed?: boolean;
}

/**
 * The islands a Thambura page can mount, by the names the page spec uses.
 * Both entries use it: app.js (main.ts) for our pages and embed.js
 * (embed.ts) for other sites.
 */
export function islandRegistry(opts: IslandsOptions = {}): Registry<PageContext, HTMLElement, LCMComponent, EventBus> {
  return {
    tala: (el, island, ctx, bus) => {
      if (!ctx.tala) throw new Error("the page made no tala for its tala island");
      return createPlayerIsland(el, bus, {
        presenter: ctx.tala,
        audio: ctx.audio,
        fixturesUrl: new URL(typeof island.config.fixturesUrl === "string" ? island.config.fixturesUrl : FIXTURES, ctx.assetBase).href,
        kit: kitOf(ctx.tracks.get("kit-1")),
        hands: handsOf(ctx.tracks.get("hands-1")),
        session: ctx.session,
        onPlaying: (on) => ctx.awake.set("tala", on),
      });
    },
    // The speed and shruthi strip on its own, for a page whose tala doesn't
    // show it (a thambura-only embed); the tala island carries its own.
    session: (el, _island, ctx, bus) => createSessionIsland(el, bus, ctx.session),
    // In a drawer (layouts/Drawer.html) the slot holds the bar's mount and
    // the floating controls; docked (layouts/SideBySide.html, and every
    // embed) the thambura mounts straight into its slot.
    thambura: (el, island, ctx, bus) => {
      const thambura = thamburaOf(ctx.tracks.get("thambura-1"));
      if (!thambura) throw new Error("the page has no thambura-1 for its thambura island");
      const onPlaying = (on: boolean) => ctx.awake.set("thambura", on);
      if (opts.embed || island.presentation !== "drawer") {
        return createThamburaIsland(el, bus, thambura, ctx.audio, ctx.link, { presentation: "panel", onPlaying, pageKeys: !opts.embed });
      }
      const mount = el.querySelector<HTMLElement>("#thambura");
      if (!mount) throw new Error("the drawer slot has no #thambura");
      return createThamburaIsland(mount, bus, thambura, ctx.audio, ctx.link, {
        presentation: "drawer",
        controls: {
          root: el.querySelector<HTMLElement>("#thambura-controls"),
          toggle: el.querySelector<HTMLElement>("#thambura-toggle"),
          play: el.querySelector<HTMLElement>("#thambura-play"),
        },
        onPlaying,
      });
    },
  };
}

/**
 * The page's shared services, and the instruments the spec starts it with.
 * `assetBase` is what the spec's URLs resolve against (PageContext), and
 * `link` is where the instruments keep the page's share link.
 */
export function buildContext(spec: PageSpec, assetBase: string, link: PageLink): PageContext {
  usePlaybackSession(navigator as { audioSession?: { type: string } });
  const audio = new AudioEngine();
  const clock = createClock(audio, workerTicker());
  const tracks = new Tracks<Instrument>();
  const opened = { session: link.opened("session-1"), thambura: link.opened("thambura-1") };
  const shruthi = new Shruthi(
    startingPitch(opened, loadQuietly(localStore("shruthi")), loadQuietly(instrumentStore("thambura-1"))),
    localStore("shruthi"),
  );
  const resolve = (url: string) => new URL(url, assetBase).href;
  // The thambura, which the page's thambura island shows. It plays to the
  // page's shruthi and moves it when its own key changes.
  let thambura: ThamburaPresenter | undefined;
  if (spec.instruments.some((i) => i.kind === "thambura")) {
    thambura = newThamburaPresenter(audio, "thambura-1", link, shruthi);
    tracks.add("thambura-1", thambura);
  }
  // The hand claps: the tala calls each sound on the clock, and they play it.
  const hands = spec.instruments.find((i) => i.kind === "hands" && typeof i.config.fixturesUrl === "string");
  if (hands) {
    const claps = newHandsPresenter(audio, "hands-1", clock);
    tracks.add("hands-1", claps);
    void claps.load(resolve(hands.config.fixturesUrl as string));
  }
  // The instruments the page starts with, as tracks numbered by kind in the
  // spec's order (kit-1, kit-2, ...). Only the first kit plays for now; a
  // second is for the track list (#101).
  const kits = spec.instruments.filter((i) => i.kind === "kit" && typeof i.config.url === "string");
  if (kits.length > 0) {
    const kit = newKitPresenter(audio, "kit-1", clock);
    tracks.add("kit-1", kit);
    shruthi.follow(() => kit.setTonic(shruthi.hz));
    void kit.load(resolve(kits[0].config.url as string));
  }
  // The tala, made here rather than by its island so the session strip and
  // the page link have it from the start. A shared link's tala and speed
  // play without being saved, as a shared thambura's setup does.
  let tala: PlayerPresenter | undefined;
  if (spec.islands.some((i) => i.name === "tala")) {
    tala = newPlayerPresenter(audio, clock);
    const shared = opened.session && decodeSession(opened.session);
    if (shared) tala.applyShared(shared.tala, shared.tempo);
  }
  const session = new SessionPresenter({
    shruthi,
    tala,
    thambura,
    kits: () => tracks.list().filter((t): t is KitPresenter => t instanceof KitPresenter),
    link: link.part("session-1"),
  });
  return {
    audio,
    clock,
    tracks,
    shruthi,
    tala,
    session,
    awake: new KeepAwake({ wakeLock: (navigator as { wakeLock?: WakeLockLike }).wakeLock, doc: document }),
    link,
    assetBase,
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

function kitOf(track: Instrument | undefined): KitPresenter | undefined {
  return track instanceof KitPresenter ? track : undefined;
}

function thamburaOf(track: Instrument | undefined): ThamburaPresenter | undefined {
  return track instanceof ThamburaPresenter ? track : undefined;
}

function handsOf(track: Instrument | undefined): HandsPresenter | undefined {
  return track instanceof HandsPresenter ? track : undefined;
}
