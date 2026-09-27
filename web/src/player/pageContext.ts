import type { Gati } from "../engine/carnatic";
import type { Ratio } from "../engine/ratio";
import { DEFAULT_TEMPO } from "../engine/selection";
import { DEFAULT_PITCH, KEYS, MAX_CENTS, normalizePitch, samePitch, tunedTonicHz, type Pitch } from "../engine/shruthi";
import type { TalaGrid } from "../engine/talaGrid";
import { TempoMap } from "../engine/tempoMap";
import type { AudioEngine } from "./audio";
import type { HandsPresenter } from "./handsPresenter";
import type { KeepAwake } from "./keepAwake";
import type { KitPresenter } from "./kitPresenter";
import type { PageLink } from "./pageLink";
import type { PlayerPresenter } from "./presenter";
import type { SessionPresenter } from "./session";
import type { Store } from "./storage";
import type { ThamburaPresenter } from "./thamburaPresenter";
import { Transport, type Ticker } from "./transport";

/**
 * What every island on the page shares: services, not instruments. The
 * instruments playing are `tracks`; the clock they play on is `clock`; the Sa
 * the pitched ones play to is `shruthi` (docs/designs/instruments.md). The page builds
 * one of these (main.ts) and hands it to each island it mounts.
 */
export interface PageContext {
  audio: AudioEngine;
  clock: Clock;
  tracks: Tracks<Instrument>;
  shruthi: Shruthi;
  /**
   * The tala, when the page has one: it keeps time on `clock` and shows the
   * images. Made with the page, not by its island, since the session strip
   * and the page link need it too.
   */
  tala?: PlayerPresenter;
  /** The speed and shruthi strip's state, and Start all. */
  session: SessionPresenter;
  awake: KeepAwake;
  /** The page's share link, which the thambura reads and writes. */
  link: PageLink;
  /**
   * What relative URLs in the page spec resolve against: the page's own
   * address on our site, embed.js's address on someone else's (embed.ts).
   */
  assetBase: string;
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
 * The Sa every pitched instrument on the page plays to (#101). There is one
 * per page: the thambura sets it and follows it, a kit follows it, and the
 * session strip shows and changes it, so a change anywhere is heard
 * everywhere. A change is saved (`store`), but the pitch it starts with
 * isn't, so a shared link's shruthi isn't kept until the listener changes it.
 */
export class Shruthi {
  private current: Pitch;
  private readonly followers: ((pitch: Pitch) => void)[] = [];

  constructor(
    initial: Pitch = DEFAULT_PITCH,
    private readonly store?: Store,
  ) {
    this.current = normalizePitch(initial);
  }

  get pitch(): Pitch {
    return this.current;
  }

  /** Sa in Hz, fine tune included. */
  get hz(): number {
    return tunedTonicHz(this.current);
  }

  /** Moves the Sa, clamped to the thambura's ranges. A patch that changes nothing is ignored. */
  set(patch: Partial<Pitch>): void {
    const next = normalizePitch({ ...this.current, ...patch }, this.current);
    if (samePitch(next, this.current)) return;
    this.current = next;
    try {
      this.store?.save(next);
    } catch {
      // Storage can be full or blocked; the Sa still holds for this visit.
    }
    for (const f of this.followers) f(next);
  }

  /** A semitone at a time, stopping at the ends of the 15 keys. */
  stepKey(delta: number): void {
    this.set({ key: Math.min(KEYS.length - 1, Math.max(0, this.current.key + delta)) });
  }

  /** Fine tune by `delta` cents, stopping at ±50. */
  nudgeCents(delta: number): void {
    this.set({ cents: Math.max(-MAX_CENTS, Math.min(MAX_CENTS, this.current.cents + delta)) });
  }

  /** Calls `f` with the current Sa now, then on every change. */
  follow(f: (pitch: Pitch) => void): void {
    this.followers.push(f);
    f(this.current);
  }
}
