import { EventBus, LifecycleController, mountIslands, type LCMComponent } from "@panyam/tsappkit";
import { hostSpec, type HostSpec } from "./page/embedSpec";
import { shadowSlot } from "./page/shadow";
import { withDefaultInstruments } from "./player/embedDefaults";
import { buildContext, islandRegistry } from "./player/islands";
import { PageLink } from "./player/pageLink";
import { readInstruments, type InstrumentSpec } from "./player/spec";
import { embedStorage } from "./player/storage";

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

/** A host's spec: the islands, and the instruments it starts with if it names any. */
export interface EmbedSpec extends HostSpec {
  instruments?: { kind: string; config?: InstrumentSpec["config"] }[];
}

export interface MountOptions {
  /** Where to look for the spec's slots. Defaults to the whole document. */
  root?: ParentNode;
  /** Light or dark, or "auto" (the default) to follow the host's colour scheme. */
  theme?: "light" | "dark" | "auto";
  /**
   * Where the listener's choices (the shruthi, the thambura's sound, presets,
   * the track list) are remembered between visits: a name of the host's
   * choosing, kept under `thambura.<name>.` in the host's localStorage. Left
   * out, nothing is written anywhere and each visit starts fresh (#144).
   * Lowercase letters, digits and dashes.
   */
  storage?: string;
}

/**
 * Mounts `spec`'s islands in their slots (`data-thambura-slot`), each in its
 * own shadow root, and starts them. The spec is read the way a spec script
 * is, so a host can leave out the layout, the instruments and an island's
 * config; one that can't be read at all throws. Returns the mounted islands;
 * a slot that isn't there or an island this entry doesn't have is logged and
 * skipped. Each call builds its own audio, clock and instruments, and keeps
 * its state apart from any other call's (`storage`).
 */
export async function mount(given: EmbedSpec, opts: MountOptions = {}): Promise<LCMComponent[]> {
  const read = hostSpec(given, readInstruments);
  if (!read) throw new Error("thambura embed: mount() was given something that isn't a spec");
  const spec = withDefaultInstruments(read);
  const root = opts.root ?? document;
  const theme = opts.theme ?? "auto";
  const storage = embedStorage(opts.storage);
  const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const bus = new EventBus();
  const components = mountIslands(
    spec,
    islandRegistry(),
    (slot) => {
      const el = root.querySelector<HTMLElement>(`[${SLOT_ATTR}="${slot}"]`);
      return el ? shadowSlot(el, STYLESHEET, dark) : null;
    },
    () => buildContext(spec, HERE, new PageLink(noAddressBar, APP), storage),
    bus,
    (message) => console.warn(message),
  );
  // No page class runs the islands' lifecycle here, so a stand-in root does.
  const top: LCMComponent = { performLocalInit: () => components, setupDependencies() {}, activate() {}, deactivate() {} };
  await new LifecycleController(bus, LifecycleController.DefaultConfig).initializeFromRoot(top);
  return components;
}

/** Mounts every spec the host page declares, with the theme and storage its script names (data-theme, data-storage). */
function mountDeclared(): void {
  for (const script of document.querySelectorAll<HTMLScriptElement>(`script[${SPEC_ATTR}]`)) {
    const spec = hostSpec(script.textContent, readInstruments);
    if (!spec) {
      console.warn(`thambura embed: a ${SPEC_ATTR} script isn't a spec this version can read`);
      continue;
    }
    const theme = script.dataset.theme;
    mount(spec, { theme: theme === "light" || theme === "dark" ? theme : "auto", storage: script.dataset.storage || undefined }).catch((err) =>
      console.warn("thambura embed:", err instanceof Error ? err.message : err),
    );
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountDeclared);
else mountDeclared();
