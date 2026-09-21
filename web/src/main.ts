import { BasePage, type LCMComponent } from "@panyam/tsappkit";
import { AudioEngine } from "./player/audio";
import { createPlayerIsland } from "./player/island";
import { KitPresenter } from "./player/kitPresenter";
import { isIOS, isInstalled, wireInstall } from "./player/install";
import { KeepAwake, usePlaybackSession, type WakeLockLike } from "./player/keepAwake";
import { createThamburaIsland } from "./player/thamburaIsland";

/**
 * Bundle entry (esbuild -> static/app.js). The home page is server-rendered by
 * goapplib with #player and #thambura elements; the tsappkit BasePage wires
 * the header's theme toggle, and this page mounts the tala player and the
 * thambura bar. Both play through one AudioEngine, so they share a clock and
 * a mixer, and either one playing keeps the phone's screen awake.
 *
 * It also registers the service worker (src/sw.ts), which makes the app
 * installable and lets it run without a network, and offers the install
 * button.
 */
class HomePage extends BasePage {
  protected override initializeSpecificComponents(): LCMComponent[] {
    usePlaybackSession(navigator as { audioSession?: { type: string } });
    const audio = new AudioEngine();
    const awake = new KeepAwake({ wakeLock: (navigator as { wakeLock?: WakeLockLike }).wakeLock, doc: document });
    const components: LCMComponent[] = [];
    // The struck instrument, built here so the thambura can tune it to the
    // same Sa. One for now; the mixer plan has several.
    const kit = new KitPresenter({
      audio,
      fetchJson: async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      },
      frames: { request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) },
    });
    const player = document.getElementById("player");
    if (player) {
      components.push(createPlayerIsland(player, this.eventBus, audio, (on) => awake.set("tala", on), kit));
    }
    const thambura = document.getElementById("thambura");
    if (thambura) {
      const controls = {
        root: document.getElementById("thambura-controls"),
        toggle: document.getElementById("thambura-toggle"),
        play: document.getElementById("thambura-play"),
      };
      components.push(
        createThamburaIsland(
          thambura,
          this.eventBus,
          audio,
          controls,
          (on) => awake.set("thambura", on),
          (settings) => kit.setThambura(settings),
        ),
      );
    }
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

BasePage.loadAfterPageLoaded("homePage", HomePage, "HomePage");
