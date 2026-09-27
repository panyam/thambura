import type { Gati } from "../engine/carnatic";
import type { Ratio } from "../engine/ratio";
import { DEFAULT_TEMPO } from "../engine/selection";
import { DEFAULT_THAMBURA, tunedTonicHz } from "../engine/shruthi";
import type { TalaGrid } from "../engine/talaGrid";
import { TempoMap } from "../engine/tempoMap";
import type { AudioEngine } from "./audio";
import type { HandsPresenter } from "./handsPresenter";
import type { KeepAwake } from "./keepAwake";
import type { KitPresenter } from "./kitPresenter";
import type { PageLink } from "./pageLink";
import type { ThamburaPresenter } from "./thamburaPresenter";
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
  tracks: Tracks<Instrument>;
  tonic: Tonic;
  awake: KeepAwake;
  /** The page's share link, which the thambura reads and writes. */
  link: PageLink;
}

/** An instrument on the page, as a track: a kit, the hand claps, or a thambura. */
export type Instrument = KitPresenter | HandsPresenter | ThamburaPresenter;

/**
 * The tala's clock, owned by the page so a page without the tala still has
 * one. One transport on one tempo map, so every voice on it agrees on where a
 * beat falls, and the tala's cycle, so anything playing along knows where
 * sam is. The thambura keeps its own transport: its speed isn't the tala's
 * tempo.
 */
export interface Clock {
  tempo: TempoMap;
  transport: Transport;
  /** The tala's cycle, set by the tala; empty until a tala is on the page. */
  tala: Latest<TalaTiming>;
  /**
   * Each sound the tala calls, as it books it: its name ("down", "open", ...)
   * and when it sounds. The hands track plays them; the tala makes no sound.
   */
  ticks: Ticks;
}

/** One sound the tala calls, at a time on the audio clock. */
export interface TickCall {
  time: number;
  sound: string;
}

/** The tala's calls, heard by whoever plays them. */
export class Ticks {
  private readonly listeners: ((call: TickCall) => void)[] = [];

  on(listener: (call: TickCall) => void): void {
    this.listeners.push(listener);
  }

  emit(call: TickCall): void {
    for (const f of this.listeners) f(call);
  }
}

/** What the tala tells the instruments playing along with it. */
export interface TalaTiming {
  grid: TalaGrid;
  nadai: Gati;
  /**
   * Where in the cycle the transport's count 0 falls, in counts. Zero when
   * the tala starts on sam; after a stop it resumes from the first beat not
   * yet heard, and every instrument has to resume there too.
   */
  resumesAt: Ratio;
}

export function createClock(audio: { readonly now: number }, ticker: Ticker, bpm = DEFAULT_TEMPO): Clock {
  const tempo = new TempoMap(bpm);
  return {
    tempo,
    transport: new Transport(audio, ticker, { tempo }),
    tala: new Latest<TalaTiming>(),
    ticks: new Ticks(),
  };
}

/**
 * A value one part of the page sets and others follow. `follow` hears the
 * current value at once, if there is one, then every change.
 */
export class Latest<T> {
  private current: T | undefined;
  private readonly followers: ((value: T) => void)[] = [];

  get value(): T | undefined {
    return this.current;
  }

  set(value: T): void {
    this.current = value;
    for (const f of this.followers) f(value);
  }

  follow(f: (value: T) => void): void {
    this.followers.push(f);
    if (this.current !== undefined) f(this.current);
  }
}

/**
 * The instruments playing, by id, in the order they were added. Each plays
 * on the audio track of the same id. Ids are `<kind>-<n>`, numbered in the
 * order the page spec lists its instruments: `kit-1` is the first kit.
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
