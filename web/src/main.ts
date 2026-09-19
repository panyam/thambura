import { BasePage, type LCMComponent } from "@panyam/tsappkit";
import { AudioEngine } from "./player/audio";
import { createPlayerIsland } from "./player/island";
import { createThamburaIsland } from "./player/thamburaIsland";

/**
 * Bundle entry (esbuild -> static/app.js). The home page is server-rendered by
 * goapplib with #player and #thambura elements; the tsappkit BasePage wires
 * the header's theme toggle, and this page mounts the tala player and the
 * thambura bar. Both play through one AudioEngine, so they share a clock and
 * a mixer.
 */
class HomePage extends BasePage {
  protected override initializeSpecificComponents(): LCMComponent[] {
    const audio = new AudioEngine();
    const components: LCMComponent[] = [];
    const player = document.getElementById("player");
    if (player) components.push(createPlayerIsland(player, this.eventBus, audio));
    const thambura = document.getElementById("thambura");
    if (thambura) {
      components.push(createThamburaIsland(thambura, this.eventBus, audio, document.getElementById("thambura-toggle")));
    }
    return components;
  }
}

BasePage.loadAfterPageLoaded("homePage", HomePage, "HomePage");
