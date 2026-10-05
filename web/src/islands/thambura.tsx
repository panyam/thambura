import type { EventBus, IslandFactory, LCMComponent } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import type { AudioEngine } from "../player/audio";
import type { Instrument, PageContext } from "../player/pageContext";
import type { PageLink } from "../player/pageLink";
import { ThamburaDocked } from "../player/ThamburaPanel";
import { ThamburaPresenter } from "../player/thamburaPresenter";

/**
 * The thambura docked in a slot of its own (layouts/SideBySide.html, and
 * embeds), loaded lazily (player/islands.ts). A page with a track list shows
 * the thambura in its row instead.
 */
const thambura: IslandFactory<PageContext, HTMLElement, LCMComponent, EventBus> = (el, _island, ctx, bus) => {
  const presenter = thamburaOf(ctx.tracks.get("thambura-1"));
  if (!presenter) throw new Error("the page has no thambura-1 for its thambura island");
  return createThamburaIsland(el, bus, presenter, ctx.audio, ctx.link);
};
export default thambura;

function thamburaOf(track: Instrument | undefined): ThamburaPresenter | undefined {
  return track instanceof ThamburaPresenter ? track : undefined;
}

/**
 * Mounts a view of `presenter`, the page's thambura, docked in `el`: the
 * panel, always showing. The page makes the presenter; this is only where
 * it's shown, on a page that puts the thambura in a slot of its own
 * (/labs/side-by-side, an embed). On a page with a track list it's the
 * thambura's card instead (TrackListView.tsx). `onPlaying` hears whenever it
 * starts or stops.
 */
function createThamburaIsland(
  el: HTMLElement,
  eventBus: EventBus,
  presenter: ThamburaPresenter,
  audio: AudioEngine,
  link: PageLink,
  opts: { onPlaying?: (playing: boolean) => void } = {},
): SolidIsland {
  const [state, setState] = signalView(presenter.state);
  presenter.attach({
    setState(s) {
      setState(s);
      opts.onPlaying?.(s.playing);
    },
  });
  const shareUrl = (setup: string) => link.url(presenter.id, setup);
  const analyser = () => audio.analyser(presenter.id);
  return new SolidIsland("thambura", el, () => <ThamburaDocked state={state} actions={presenter} shareUrl={shareUrl} analyser={analyser} />, eventBus);
}

