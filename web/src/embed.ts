import { EventBus, LifecycleController, type LCMComponent } from "@panyam/tsappkit";
import { hostSpec } from "./page/embedSpec";
import { mountIslands } from "./page/mount";
import { shadowSlot } from "./page/shadow";
import type { PageSpec } from "./page/spec";
import { withDefaultInstruments } from "./player/embedDefaults";
import { buildContext, islandRegistry } from "./player/islands";
import { PageLink } from "./player/pageLink";

/**
 * Bundle entry for other sites (esbuild -> static/embed.js): the tala and
 * the thambura on someone else's page. A host writes a page spec and a slot
 * for each island, then loads this script from our site:
 *
 *   <script type="application/json" data-thambura-spec>
 *     {"islands": [{"name": "thambura", "slot": "drone"}]}
 *   </script>
 *   <div data-thambura-slot="drone"></div>
 *   <script type="module" src="https://thambura.com/static/embed.js"></script>
 *
 * Or it imports `mount` and passes a spec itself. Each island mounts in a
 * shadow root with our stylesheet, so the host's CSS and ours stay apart.
 * Everything the islands load (fixtures, sounds, kits, the lazy views)
 * resolves against this script's own address, so it all comes from our site
 * whatever page it's on; that needs our /static to allow cross-origin reads,
 * which it does. There's no service worker, no install button and no theme
 * toggle: those belong to our pages, not the host's.
 */

const SPEC_ATTR = "data-thambura-spec";
const SLOT_ATTR = "data-thambura-slot";
// This script's own address, e.g. https://thambura.com/static/embed.js.
const HERE = import.meta.url;
const STYLESHEET = new URL("css/tailwind.css", HERE).href;
// Where a copied share link should open: the app, not the host's page.
const APP = new URL("/", HERE).href;
// The host's address bar isn't ours: the setup lives only in memory, and
// Copy link makes a link on the app.
const noAddressBar = { read: () => null, write: () => {} };

export interface MountOptions {
  /** Where to look for the spec's slots. Defaults to the whole document. */
  root?: ParentNode;
  /** Light or dark, or "auto" (the default) to follow the host's colour scheme. */
  theme?: "light" | "dark" | "auto";
}

/**
 * Mounts `spec`'s islands in their slots (`data-thambura-slot`), each in its
 * own shadow root, and starts them. Returns the mounted islands; a slot that
 * isn't there or an island this entry doesn't have is logged and skipped.
 * Each call builds its own audio, clock and instruments.
 */
export async function mount(hostSpec: PageSpec, opts: MountOptions = {}): Promise<LCMComponent[]> {
  const spec = withDefaultInstruments(hostSpec);
  const root = opts.root ?? document;
  const theme = opts.theme ?? "auto";
  const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const bus = new EventBus();
  const components = mountIslands(
    spec,
    islandRegistry({ embed: true }),
    (slot) => {
      const el = root.querySelector<HTMLElement>(`[${SLOT_ATTR}="${slot}"]`);
      return el ? shadowSlot(el, STYLESHEET, dark) : null;
    },
    () => buildContext(spec, HERE, new PageLink(noAddressBar, APP)),
    bus,
    (message) => console.warn(message),
  );
  // No page class runs the islands' lifecycle here, so a stand-in root does.
  const top: LCMComponent = { performLocalInit: () => components, setupDependencies() {}, activate() {}, deactivate() {} };
  await new LifecycleController(bus, LifecycleController.DefaultConfig).initializeFromRoot(top);
  return components;
}

/** Mounts every spec the host page declares, with the theme its script names (data-theme). */
function mountDeclared(): void {
  for (const script of document.querySelectorAll<HTMLScriptElement>(`script[${SPEC_ATTR}]`)) {
    const spec = hostSpec(script.textContent);
    if (!spec) {
      console.warn(`thambura embed: a ${SPEC_ATTR} script isn't a spec this version can read`);
      continue;
    }
    const theme = script.dataset.theme;
    void mount(spec, { theme: theme === "light" || theme === "dark" ? theme : "auto" });
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountDeclared);
else mountDeclared();
