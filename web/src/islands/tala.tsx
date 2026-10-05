import type { EventBus, IslandFactory, LCMComponent } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import { createSignal } from "solid-js";
import { REST } from "../engine/motion";
import type { AudioEngine } from "../player/audio";
import { HandsPresenter } from "../player/handsPresenter";
import { KitPresenter } from "../player/kitPresenter";
import type { Instrument, PageContext } from "../player/pageContext";
import { PlayerView } from "../player/PlayerView";
import type { PlayerPresenter } from "../player/presenter";
import type { SessionPresenter, SessionState } from "../player/session";
import { watched } from "../player/watched";

/**
 * The tala island (player/islands.ts loads it lazily): the beat image, the
 * transport and the tala's selects, over the page's tala presenter. Its own
 * chunk, so a page without a tala doesn't download PlayerView.
 */

// The tala's sounds and images, from the root, so the same string works on
// our pages and, resolved against embed.js, on anyone else's.
const FIXTURES = "/static/Resources/TalasFixtures.json";

const tala: IslandFactory<PageContext, HTMLElement, LCMComponent, EventBus> = (el, island, ctx, bus) => {
  if (!ctx.tala) throw new Error("the page made no tala for its tala island");
  return createPlayerIsland(el, bus, {
    presenter: ctx.tala,
    audio: ctx.audio,
    fixturesUrl: new URL(typeof island.config.fixturesUrl === "string" ? island.config.fixturesUrl : FIXTURES, ctx.assetBase).href,
    kit: () => ctx.tracks.list().find((t): t is KitPresenter => t instanceof KitPresenter),
    onTracksChange: (f) => ctx.tracks.onChange(f),
    instrumentControls: island.config.instrumentControls !== false,
    wide: island.config.wide === true,
    hands: handsOf(ctx.tracks.get("hands-1")),
    session: ctx.session,
    onPlaying: (on) => ctx.awake.set("tala", on),
  });
};
export default tala;

function handsOf(track: Instrument | undefined): HandsPresenter | undefined {
  return track instanceof HandsPresenter ? track : undefined;
}

interface PlayerIslandDeps {
  /** The page's tala (PageContext.tala), which this island shows. */
  presenter: PlayerPresenter;
  audio: AudioEngine;
  /** The tala's sound and image groups, from the page spec's config. */
  fixturesUrl?: string;
  /**
   * The struck instrument on the page now, if any, for the view only: its
   * stroke lane (and its pad, see `instrumentControls`) sit with the tala. It
   * plays along on the page's clock by itself; the tala doesn't know it's
   * there. `onTracksChange` says when to ask again, as the track list adds
   * and removes one.
   */
  kit?: () => KitPresenter | undefined;
  onTracksChange?: (f: () => void) => void;
  /**
   * Whether the instruments' own controls (the claps' Sounds and Volume, the
   * kit's stroke lane and pad) sit with the tala. A page with a track list
   * shows them in the instruments' rows instead.
   */
  instrumentControls?: boolean;
  /** Lays the tala out across a page-wide panel (PlayerView's `wide`). */
  wide?: boolean;
  /**
   * The hand claps from the page's tracks, for the view only: their Sounds
   * menu and Volume sit with the tala. They play the tala's calls from the
   * page's clock by themselves.
   */
  hands?: HandsPresenter;
  /** The page's speed and shruthi, shown as a strip under the beat image. */
  session?: SessionPresenter;
  /** Hears whenever the tala starts or stops. */
  onPlaying?: (playing: boolean) => void;
}

/** Mounts the page's tala on `el`, with its fixture of images loading. */
function createPlayerIsland(el: HTMLElement, eventBus: EventBus, deps: PlayerIslandDeps): SolidIsland {
  const { audio, onPlaying, presenter } = deps;
  const session = deps.session;
  let sessionView: { state: () => SessionState; actions: SessionPresenter } | undefined;
  if (session) {
    const [sessionState, setSessionState] = signalView(session.state);
    session.attach({ setState: setSessionState });
    sessionView = { state: sessionState, actions: session };
  }
  // The kit follows the page's tracks: the track list can add or remove it.
  let shown: KitPresenter | undefined;
  const [kitView, setKitView] = createSignal<{ state: () => KitPresenter["state"]; actions: KitPresenter } | undefined>();
  const followKit = () => {
    const kit = deps.kit?.();
    if (kit === shown) return;
    shown = kit;
    setKitView(kit ? { state: watched(kit), actions: kit } : undefined);
  };
  followKit();
  deps.onTracksChange?.(followKit);
  const hands = deps.hands;
  const handsView = hands ? { state: watched(hands), actions: hands } : undefined;

  const [state, setState] = signalView(presenter.state);
  const [pose, setPose] = createSignal(REST);
  presenter.attach({
    setState(s) {
      setState(s);
      onPlaying?.(s.playing);
    },
    setPose,
  });
  void presenter.load(deps.fixturesUrl || FIXTURES);

  // Drop the <noscript> fallback; the island owns the element's children.
  el.replaceChildren();
  return new SolidIsland(
    "player",
    el,
    () => <PlayerView state={state} pose={pose} actions={presenter} kit={kitView()} instrumentControls={deps.instrumentControls !== false} wide={deps.wide === true} hands={handsView} session={sessionView} />,
    eventBus,
  );
}

