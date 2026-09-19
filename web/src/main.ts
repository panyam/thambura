import { BasePage, type LCMComponent } from "@panyam/tsappkit";
import { AudioEngine } from "./player/audio";
import { createPlayerIsland } from "./player/island";
import { KeepAwake, usePlaybackSession, type WakeLockLike } from "./player/keepAwake";
import { createThamburaIsland } from "./player/thamburaIsland";

/**
 * Bundle entry (esbuild -> static/app.js). The home page is server-rendered by
 * goapplib with #player and #thambura elements; the tsappkit BasePage wires
 * the header's theme toggle, and this page mounts the tala player and the
 * thambura bar. Both play through one AudioEngine, so they share a clock and
 * a mixer, and either one playing keeps the phone's screen awake.
 */
class HomePage extends BasePage {
  protected override initializeSpecificComponents(): LCMComponent[] {
    usePlaybackSession(navigator as { audioSession?: { type: string } });
    const audio = new AudioEngine();
    const awake = new KeepAwake({ wakeLock: (navigator as { wakeLock?: WakeLockLike }).wakeLock, doc: document });
    const components: LCMComponent[] = [];
    const player = document.getElementById("player");
    if (player) {
      components.push(createPlayerIsland(player, this.eventBus, audio, (on) => awake.set("tala", on)));
    }
    const thambura = document.getElementById("thambura");
    if (thambura) {
      const toggle = document.getElementById("thambura-toggle");
      components.push(createThamburaIsland(thambura, this.eventBus, audio, toggle, (on) => awake.set("thambura", on)));
    }
    return components;
  }
}

BasePage.loadAfterPageLoaded("homePage", HomePage, "HomePage");
