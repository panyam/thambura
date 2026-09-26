import { DEFAULT_TEMPO } from "../engine/selection";
import { DEFAULT_THAMBURA, tunedTonicHz } from "../engine/shruthi";
import { TempoMap } from "../engine/tempoMap";
import type { AudioEngine } from "./audio";
import type { KeepAwake } from "./keepAwake";
import type { KitPresenter } from "./kitPresenter";
import { Transport, type Ticker } from "./transport";

/**
 * What every island on the page shares: services, not instruments. The
 * instruments playing are `tracks`; the clock they play on is `clock`; the Sa
 * the pitched ones follow is `tonic` (docs/designs/instruments.md). The page builds
 * one of these (main.ts) and hands it to each island it mounts.
 */
export interface PageContext {
  audio: AudioEngine;
  clock: Clock;
  tracks: Tracks<KitPresenter>;
  tonic: Tonic;
  awake: KeepAwake;
}

/**
 * The tala's clock, owned by the page so a page without the tala still has
 * one. One transport on one tempo map, so every voice on it agrees on where a
 * beat falls. The thambura keeps its own transport: its speed isn't the
 * tala's tempo.
 * TODO(instruments): the tala grid (engine/talaGrid.ts) joins this once the
 * tala sets one here rather than inside PlayerPresenter.
 */
export interface Clock {
  tempo: TempoMap;
  transport: Transport;
}

export function createClock(audio: { readonly now: number }, ticker: Ticker, bpm = DEFAULT_TEMPO): Clock {
  const tempo = new TempoMap(bpm);
  return { tempo, transport: new Transport(audio, ticker, { tempo }) };
}

/**
 * The instruments playing, by id, in the order they were added. It only
 * holds today's kit for now; the instrument work makes each one a track
 * with its own bus.
 */
export class Tracks<T> {
  private readonly byId = new Map<string, T>();

  /** Adds a track. Ids are unique; adding one twice is a bug, so it throws. */
  add(id: string, track: T): void {
    if (this.byId.has(id)) throw new Error(`track "${id}" is already on the page`);
    this.byId.set(id, track);
  }

  get(id: string): T | undefined {
    return this.byId.get(id);
  }

  list(): T[] {
    return [...this.byId.values()];
  }
}

/**
 * The Sa the pitched instruments follow, in Hz. The thambura sets it; a drum
 * follows it. Starts on the default thambura's Sa, so a page without the
 * thambura still has one.
 */
export class Tonic {
  private current = tunedTonicHz(DEFAULT_THAMBURA);
  private readonly followers: ((hz: number) => void)[] = [];

  get hz(): number {
    return this.current;
  }

  /** Moves the Sa. A value that isn't a positive number, or doesn't change it, is ignored. */
  set(hz: number): void {
    if (!Number.isFinite(hz) || hz <= 0 || hz === this.current) return;
    this.current = hz;
    for (const f of this.followers) f(hz);
  }

  /** Calls `f` with the current Sa now, then on every change. */
  follow(f: (hz: number) => void): void {
    this.followers.push(f);
    f(this.current);
  }
}
