import { assetUrls, parseCatalog, resolveAsset, type AssetGroup } from "../engine/assets";
import type { AudioOut, TrackId } from "./audio";
import type { Clock, TickCall } from "./pageContext";
import type { Store } from "./storage";

export interface HandsState {
  status: "loading" | "ready" | "error";
  /** The sound groups the fixture offers, for the Sounds menu, and the one playing. */
  soundGroups: string[];
  soundGroup: string;
  /** 0-100. */
  volume: number;
}

export interface HandsView {
  setState(state: HandsState): void;
}

export interface HandsDeps {
  audio: AudioOut;
  /** The audio track it plays on, which is also its id on the page (`hands-1`). */
  track: TrackId;
  /** The page's clock. It plays the tala's calls from it, and stops with it. */
  clock?: Clock;
  fetchJson(url: string): Promise<unknown>;
  /** Where its choices (Sounds, Volume) are kept between visits. */
  store?: Store;
  /**
   * Where the tala kept Sounds and Volume before the claps were a track of
   * their own. Read once, when its own store has none.
   */
  legacyStore?: Store;
}

export const DEFAULT_HANDS_VOLUME = 50;

/**
 * The hand claps, as a track on the page. The tala decides which sound each
 * tick is ("down", "open", "one" ...) and calls it on the clock; this plays it
 * from the chosen sound group (Clap, Metronome) on its own audio track, so the
 * claps have their own level like any other instrument. It takes back what it
 * booked when the transport stops.
 */
export class HandsPresenter {
  state: HandsState;
  private view: HandsView | null = null;
  private groups: AssetGroup[] = [];
  private readonly wanted: string;

  constructor(private readonly deps: HandsDeps) {
    const own = loadSafely(deps.store);
    const hasOwn = "soundGroup" in own || "volume" in own;
    const saved = hasOwn ? own : loadSafely(deps.legacyStore);
    this.wanted = typeof saved.soundGroup === "string" ? saved.soundGroup : "";
    this.state = {
      status: "loading",
      soundGroups: [],
      soundGroup: "",
      volume: typeof saved.volume === "number" ? clampVolume(saved.volume) : DEFAULT_HANDS_VOLUME,
    };
    deps.audio.setLevel(deps.track, this.state.volume);
    if (!hasOwn && ("soundGroup" in saved || "volume" in saved)) this.save(this.wanted);
    deps.clock?.ticks.on((call) => this.play(call));
    deps.clock?.transport.onStop(() => deps.audio.cancel(deps.track));
  }

  attach(view: HandsView): void {
    this.view = view;
    view.setState(this.state);
  }

  /** Loads the fixture's sound groups and the saved one's samples, or the first group's. */
  async load(fixturesUrl: string): Promise<void> {
    try {
      this.groups = parseCatalog(await this.deps.fetchJson(fixturesUrl)).soundGroups;
    } catch (err) {
      console.warn(`hands: could not load ${fixturesUrl}:`, err);
      this.update({ status: "error" });
      return;
    }
    this.update({ soundGroups: this.groups.map((g) => g.name) });
    const first = this.find(this.wanted) ?? this.groups[0];
    if (first) await this.apply(first);
    this.update({ status: "ready" });
  }

  // ---- intents -----------------------------------------------------------

  /** Switches sound group; one the fixture doesn't have is ignored. */
  async setSoundGroup(name: string): Promise<void> {
    const group = this.find(name);
    if (!group) return;
    await this.apply(group);
    this.save();
  }

  setVolume(percent: number): void {
    const volume = clampVolume(percent);
    this.deps.audio.setLevel(this.deps.track, volume);
    this.update({ volume });
    this.save();
  }

  // ---- internals ---------------------------------------------------------

  private play(call: TickCall): void {
    const group = this.find(this.state.soundGroup);
    const url = group ? resolveAsset(group, call.sound) : null;
    if (url) this.deps.audio.play(url, this.deps.track, call.time);
  }

  private async apply(group: AssetGroup): Promise<void> {
    const failed = await this.deps.audio.load(assetUrls(group));
    if (failed.length > 0) console.warn(`sound group ${group.name}: ${failed.length} sample(s) failed`, failed);
    this.update({ soundGroup: group.name });
  }

  private find(name: string): AssetGroup | undefined {
    return this.groups.find((g) => g.name === name);
  }

  /** Keeps the choices for the next visit. Loading never calls this, except to carry the tala's old ones over. */
  private save(soundGroup = this.state.soundGroup): void {
    try {
      this.deps.store?.save({ soundGroup, volume: this.state.volume });
    } catch {
      // Storage can be full or blocked; the choices still hold for this visit.
    }
  }

  private update(patch: Partial<HandsState>): void {
    this.state = { ...this.state, ...patch };
    this.view?.setState(this.state);
  }
}

function loadSafely(store: Store | undefined): Record<string, unknown> {
  try {
    const saved = store?.load();
    return typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function clampVolume(percent: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(percent) ? percent : DEFAULT_HANDS_VOLUME)));
}
