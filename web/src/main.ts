import type { LCMComponent } from "@panyam/tsappkit";
import { IslandPage } from "./page/islandPage";
import type { PageSpec } from "./page/spec";
import { isIOS, isInstalled, wireInstall } from "./player/install";
import { buildContext, islandRegistry } from "./player/islands";
import type { PageContext } from "./player/pageContext";
import { addressBar, PageLink } from "./player/pageLink";
import { wireFloatingPlay, wireSessionKeys } from "./player/session";

/**
 * Bundle entry (esbuild -> static/app.js). The page is server-rendered by
 * goapplib with a page spec (internal/page) naming its islands, their slots
 * and the instruments it starts with; IslandPage mounts them from the
 * registry in player/islands.ts, all sharing one PageContext: one
 * AudioEngine, one clock, the instruments playing, the Sa they follow, and
 * the wake lock that either island playing holds. embed.ts mounts the same
 * islands on other sites.
 *
 * It also registers the service worker (src/sw.ts), which makes the app
 * installable and lets it run without a network, and offers the install
 * button.
 */
const REGISTRY = islandRegistry();

class HomePage extends IslandPage<PageContext> {
  protected registry() {
    return REGISTRY;
  }

  protected makeContext(spec: PageSpec): PageContext {
    const ctx = buildContext(spec, location.href, new PageLink(addressBar()));
    wireSessionKeys(document, ctx.session);
    wireFloatingPlay(document.getElementById("play-all"), ctx.session);
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
