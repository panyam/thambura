import type { EventBus } from "@panyam/tsappkit";
import { SolidIsland, signalView } from "@panyam/tsappkit-solid";
import type { SessionPresenter } from "./session";
import { SessionStrip } from "./SessionStrip";

/** Mounts the page's speed and shruthi strip on `el`, on its own. */
export function createSessionIsland(el: HTMLElement, eventBus: EventBus, session: SessionPresenter): SolidIsland {
  const [state, setState] = signalView(session.state);
  session.attach({ setState });
  el.replaceChildren();
  return new SolidIsland("session", el, () => <SessionStrip state={state} actions={session} />, eventBus);
}
