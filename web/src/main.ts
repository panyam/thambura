import { BasePage, type LCMComponent } from "@panyam/tsappkit";
import { createPlayerIsland } from "./player/island";

/**
 * Bundle entry (esbuild -> static/app.js). The home page is server-rendered by
 * goapplib with a #player element; the tsappkit BasePage wires the header's
 * theme toggle, and this page mounts the player island into #player.
 */
class HomePage extends BasePage {
  protected override initializeSpecificComponents(): LCMComponent[] {
    const el = document.getElementById("player");
    return el ? [createPlayerIsland(el, this.eventBus)] : [];
  }
}

BasePage.loadAfterPageLoaded("homePage", HomePage, "HomePage");
