import { signalView } from "@panyam/tsappkit-solid";
import type { Accessor } from "solid-js";

/**
 * A presenter's state as a Solid signal, through its `watch`, so more than
 * one view can show it (a kit shows in the tala's lane and in its track).
 */
export function watched<S>(presenter: { state: S; watch(f: (state: S) => void): void }): Accessor<S> {
  const [state, setState] = signalView(presenter.state);
  presenter.watch(setState);
  return state;
}
