import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import { createSignal } from "solid-js";
import { HandsPresenter } from "./handsPresenter";
import { KitPresenter } from "./kitPresenter";
import type { Instrument, PageContext } from "./pageContext";
import { ThamburaPresenter } from "./thamburaPresenter";
import { TrackListView, type TrackInstrument } from "./TrackListView";
import { watched } from "./watched";

/**
 * Mounts the page's track list (#101) on `el`: a card per instrument, with
 * Add and Remove. The list itself is the page's (`ctx.trackList`), made with
 * the page, since it decides which instruments the page starts with.
 */
export function createTracksIsland(el: HTMLElement, eventBus: EventBus, ctx: PageContext): SolidIsland {
  const list = ctx.trackList;
  const [state, setState] = signalView(list.state);
  list.attach({ setState });

  // Each instrument's state as a signal, made once per instrument, so a
  // re-render of the list doesn't watch it again.
  const views = new WeakMap<Instrument, TrackInstrument>();
  const instrument = (id: string): TrackInstrument | undefined => {
    const inst = list.instrument(id);
    if (!inst) return undefined;
    let v = views.get(inst);
    if (!v) {
      if (inst instanceof ThamburaPresenter) v = { kind: "thambura", state: watched(inst), actions: inst };
      else if (inst instanceof KitPresenter) v = { kind: "kit", state: watched(inst), actions: inst };
      else if (inst instanceof HandsPresenter) v = { kind: "hands", state: watched(inst), actions: inst };
      else return undefined;
      views.set(inst, v);
    }
    return v;
  };

  // What each kit is called, for Add before it's loaded: its manifest's instrument.
  const [kitNames, setKitNames] = createSignal<string[]>([]);
  void Promise.all(
    list.kitUrls().map(async (url) => {
      try {
        const r = await fetch(new URL(url, ctx.assetBase).href);
        const kit = (await r.json()) as { instrument?: unknown };
        return typeof kit.instrument === "string" ? kit.instrument.charAt(0).toUpperCase() + kit.instrument.slice(1) : "";
      } catch {
        return "";
      }
    }),
  ).then(setKitNames);

  el.replaceChildren();
  return new SolidIsland(
    "tracks",
    el,
    () => (
      <TrackListView
        state={state}
        actions={list}
        instrument={instrument}
        kitNames={kitNames}
        shareUrl={(id, link) => ctx.link.url(id, link)}
        analyser={(id) => ctx.audio.analyser(id)}
      />
    ),
    eventBus,
  );
}
