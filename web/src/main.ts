import type { EventBus, LCMComponent } from "@panyam/tsappkit";
import { tunedTonicHz, type ThamburaSettings } from "./engine/shruthi";
import { IslandPage } from "./page/islandPage";
import type { Registry } from "./page/mount";
import type { PageSpec } from "./page/spec";
import { AudioEngine } from "./player/audio";
import { isIOS, isInstalled, wireInstall } from "./player/install";
import { HandsPresenter } from "./player/handsPresenter";
import { createPlayerIsland, newHandsPresenter, newKitPresenter } from "./player/island";
import { KeepAwake, usePlaybackSession, type WakeLockLike } from "./player/keepAwake";
import { KitPresenter } from "./player/kitPresenter";
import { createClock, Tonic, Tracks, type Instrument, type PageContext } from "./player/pageContext";
import { addressBar, PageLink } from "./player/pageLink";
import { createThamburaIsland, newThamburaPresenter } from "./player/thamburaIsland";
import { ThamburaPresenter } from "./player/thamburaPresenter";
import { workerTicker } from "./player/transport";

/**
 * Bundle entry (esbuild -> static/app.js). The page is server-rendered by
 * goapplib with a page spec (internal/page) naming its islands, their slots
 * and the instruments it starts with; IslandPage mounts them from the
 * registry below, all sharing one PageContext: one AudioEngine, one clock,
 * the instruments playing, the Sa they follow, and the wake lock that either
 * island playing holds.
 *
 * It also registers the service worker (src/sw.ts), which makes the app
 * installable and lets it run without a network, and offers the install
 * button.
 */
const REGISTRY: Registry<PageContext, HTMLElement, LCMComponent, EventBus> = {
  tala: (el, island, ctx, bus) =>
    createPlayerIsland(el, bus, {
      audio: ctx.audio,
      clock: ctx.clock,
      fixturesUrl: typeof island.config.fixturesUrl === "string" ? island.config.fixturesUrl : undefined,
      kit: kitOf(ctx.tracks.get("kit-1")),
      hands: handsOf(ctx.tracks.get("hands-1")),
      onPlaying: (on) => ctx.awake.set("tala", on),
    }),
  // In a drawer (layouts/Drawer.html) the slot holds the bar's mount and
  // the floating controls; docked (layouts/SideBySide.html) the thambura
  // mounts straight into its slot.
  thambura: (el, island, ctx, bus) => {
    const thambura = thamburaOf(ctx.tracks.get("thambura-1"));
    if (!thambura) throw new Error("the page has no thambura-1 for its thambura island");
    const onPlaying = (on: boolean) => ctx.awake.set("thambura", on);
    const onSettings = (settings: ThamburaSettings) => ctx.tonic.set(tunedTonicHz(settings));
    if (island.presentation !== "drawer") return createThamburaIsland(el, bus, thambura, ctx.audio, ctx.link, { presentation: "panel", onPlaying, onSettings });
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
      onSettings,
    });
  },
};

class HomePage extends IslandPage<PageContext> {
  protected registry() {
    return REGISTRY;
  }

  protected makeContext(spec: PageSpec): PageContext {
    usePlaybackSession(navigator as { audioSession?: { type: string } });
    const audio = new AudioEngine();
    const ctx: PageContext = {
      audio,
      clock: createClock(audio, workerTicker()),
      tracks: new Tracks<Instrument>(),
      tonic: new Tonic(),
      awake: new KeepAwake({ wakeLock: (navigator as { wakeLock?: WakeLockLike }).wakeLock, doc: document }),
      link: new PageLink(addressBar()),
    };
    // The thambura, which the page's thambura island shows. Made before any
    // kit, so a kit's first tuning can follow it.
    if (spec.instruments.some((i) => i.kind === "thambura")) {
      ctx.tracks.add("thambura-1", newThamburaPresenter(audio, "thambura-1", ctx.link));
    }
    // The hand claps: the tala calls each sound on the clock, and they play it.
    const hands = spec.instruments.find((i) => i.kind === "hands" && typeof i.config.fixturesUrl === "string");
    if (hands) {
      const claps = newHandsPresenter(audio, "hands-1", ctx.clock);
      ctx.tracks.add("hands-1", claps);
      void claps.load(hands.config.fixturesUrl as string);
    }
    // The instruments the page starts with, as tracks numbered by kind in the
    // spec's order (kit-1, kit-2, ...). Only the first kit plays for now; a
    // second is for the track list (#101).
    const kits = spec.instruments.filter((i) => i.kind === "kit" && typeof i.config.url === "string");
    if (kits.length > 0) {
      const kit = newKitPresenter(audio, "kit-1", ctx.clock);
      ctx.tracks.add("kit-1", kit);
      ctx.tonic.follow((hz) => kit.setTonic(hz));
      void kit.load(kits[0].config.url as string);
    }
    return ctx;
  }

  protected override initializeSpecificComponents(): LCMComponent[] {
    const components = super.initializeSpecificComponents();
    wireInstall(
      window,
      { button: document.getElementById("install-app"), hint: document.getElementById("install-hint") },
      { installed: isInstalled(window, navigator as { standalone?: boolean }), ios: isIOS(navigator) },
    );
    // After load: the worker's first install fetches the app shell, and that
    // shouldn't compete with the page's own assets.
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("service worker:", err));
      });
    }
    return components;
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

IslandPage.loadAfterPageLoaded("homePage", HomePage, "HomePage");
