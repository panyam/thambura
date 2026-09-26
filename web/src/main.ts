import type { EventBus, LCMComponent } from "@panyam/tsappkit";
import { tunedTonicHz, type ThamburaSettings } from "./engine/shruthi";
import { IslandPage } from "./page/islandPage";
import type { Registry } from "./page/mount";
import type { PageSpec } from "./page/spec";
import { AudioEngine } from "./player/audio";
import { isIOS, isInstalled, wireInstall } from "./player/install";
import { createPlayerIsland, newKitPresenter } from "./player/island";
import { KeepAwake, usePlaybackSession, type WakeLockLike } from "./player/keepAwake";
import type { KitPresenter } from "./player/kitPresenter";
import { createClock, Tonic, Tracks, type PageContext } from "./player/pageContext";
import { createThamburaIsland } from "./player/thamburaIsland";
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
      kit: ctx.tracks.get("kit"),
      onPlaying: (on) => ctx.awake.set("tala", on),
    }),
  // In a drawer (layouts/Drawer.html) the slot holds the bar's mount and
  // the floating controls; docked (layouts/SideBySide.html) the thambura
  // mounts straight into its slot.
  thambura: (el, island, ctx, bus) => {
    const onPlaying = (on: boolean) => ctx.awake.set("thambura", on);
    const onSettings = (settings: ThamburaSettings) => ctx.tonic.set(tunedTonicHz(settings));
    if (island.presentation !== "drawer") return createThamburaIsland(el, bus, ctx.audio, { presentation: "panel", onPlaying, onSettings });
    const mount = el.querySelector<HTMLElement>("#thambura");
    if (!mount) throw new Error("the drawer slot has no #thambura");
    return createThamburaIsland(mount, bus, ctx.audio, {
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
      tracks: new Tracks<KitPresenter>(),
      tonic: new Tonic(),
      awake: new KeepAwake({ wakeLock: (navigator as { wakeLock?: WakeLockLike }).wakeLock, doc: document }),
    };
    // The instruments the page starts with. One kit for now, under a
    // placeholder id; later kits in the spec are left for the instrument work.
    // TODO(instruments): a track per instrument, with instance ids.
    const kits = spec.instruments.filter((i) => i.kind === "kit" && typeof i.config.url === "string");
    if (kits.length > 0) {
      const kit = newKitPresenter(audio);
      ctx.tracks.add("kit", kit);
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

IslandPage.loadAfterPageLoaded("homePage", HomePage, "HomePage");
