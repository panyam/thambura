import type { EventBus, IslandFactory, LCMComponent } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import type { PageContext } from "../player/pageContext";
import type { SessionPresenter } from "../player/session";
import { SessionStrip } from "../player/SessionStrip";

/** Mounts the page's speed and shruthi strip on `el`, on its own. */
function createSessionIsland(el: HTMLElement, eventBus: EventBus, session: SessionPresenter): SolidIsland {
  const [state, setState] = signalView(session.state);
  session.attach({ setState });
  el.replaceChildren();
  return new SolidIsland("session", el, () => <SessionStrip state={state} actions={session} />, eventBus);
}

/** The session island, loaded lazily (player/islands.ts). */
const session: IslandFactory<PageContext, HTMLElement, LCMComponent, EventBus> = (el, _island, ctx, bus) => createSessionIsland(el, bus, ctx.session);
export default session;
