import type { Beat } from "./beat";
import type { BeatCursor, Position } from "./cursor";
import { add, cmp, mul, ratio, toNumber, ZERO, type Ratio } from "./ratio";
import type { TempoMap } from "./tempoMap";

/**
 * A voice that produces timed events for a look-ahead scheduler. Times are on
 * the audio clock, in seconds. The scheduler repeatedly asks for everything
 * before `until` (now plus the look-ahead window); each event is returned once.
 */
export interface Sequencer<E> {
  start(at: number): void;
  /** Stops emitting and forgets events that have not started by `now`. */
  stop(now: number): void;
  pull(now: number, until: number): E[];
}

/**
 * A beat starting. It carries what the image cue needs, and stop uses these to
 * rewind to the first beat the student hasn't heard.
 */
export interface StepEvent {
  kind: "step";
  time: number;
  /** Musical position: counts since the transport started. */
  at: Ratio;
  position: Position;
  beat: Beat;
  /**
   * A uniform draw in [0, 1), made once per step. Random asset groups (the
   * SaRiGaMa "randomness mode") use it to pick this step's image and sound, so
   * both come from the same draw.
   */
  variant: number;
}

/** One sound struck within a step. */
export interface TickEvent {
  kind: "tick";
  time: number;
  at: Ratio;
  sound: string;
  /** The step's draw (see StepEvent). */
  variant: number;
}

export type TalaEvent = StepEvent | TickEvent;

// A zero-length beat would stall the pull loop.
const MIN_COUNTS = ratio(1, 1000);

/**
 * Emits the tala from a BeatCursor in musical time, and places it on the audio
 * clock through the shared TempoMap. Each tick is its own event, turned into
 * seconds only when it is pulled, so a tempo change reaches the rest of a
 * long beat (a Misra Chaapu at 10 bpm is one 21 s beat) and not only the
 * next one.
 */
export class TalaSequencer implements Sequencer<TalaEvent> {
  private active = false;
  // Where the next beat starts, in counts.
  private nextAt: Ratio = ZERO;
  // The current beat's events not yet handed out, in musical order.
  private queue: TalaEvent[] = [];
  // Steps already handed out that had not started at the last pull. Stop uses
  // them to rewind the cursor to the first step the student has not heard yet.
  private pending: StepEvent[] = [];

  constructor(
    private readonly cursor: BeatCursor,
    private readonly tempo: TempoMap,
    private readonly rng: () => number = Math.random,
  ) {}

  get running(): boolean {
    return this.active;
  }

  /** Starts at count 0, which the transport's TempoMap puts at `at`. */
  start(_at: number): void {
    this.active = true;
    this.nextAt = ZERO;
    this.queue = [];
    this.pending = [];
  }

  stop(now: number): void {
    const unheard = this.pending.find((e) => e.time > now);
    if (unheard) this.cursor.seek(unheard.position);
    this.active = false;
    this.queue = [];
    this.pending = [];
  }

  pull(now: number, until: number): TalaEvent[] {
    const out: TalaEvent[] = [];
    while (this.active) {
      const head = this.queue[0];
      if (!head || cmp(this.nextAt, head.at) <= 0) {
        if (this.tempo.secondsAt(this.nextAt) >= until || !this.enqueueBeat()) break;
        continue;
      }
      const time = this.tempo.secondsAt(head.at);
      if (time >= until) break;
      head.time = time;
      out.push(head);
      this.queue.shift();
    }
    this.pending = this.pending
      .filter((e) => e.time > now)
      .concat(out.filter((e): e is StepEvent => e.kind === "step"));
    return out;
  }

  /**
   * The cursor's current beat as if it started at `time`, at the map's
   * current tempo, without advancing. Manual stepping (prev/next/restart)
   * plays one of these; it doesn't touch the transport.
   */
  beatAt(time: number): TalaEvent[] {
    const events = this.eventsFor(ZERO);
    const spc = this.tempo.secondsPerCount;
    for (const e of events) e.time = time + toNumber(e.at) * spc;
    return events;
  }

  /** Queues the cursor's beat at `nextAt` and moves on. False when there are no beats. */
  private enqueueBeat(): boolean {
    const events = this.eventsFor(this.nextAt);
    if (events.length === 0) return false;
    const beat = (events[0] as StepEvent).beat;
    this.nextAt = add(this.nextAt, counts(beat));
    this.cursor.forward();
    this.queue = [...this.queue, ...events].sort((a, b) => cmp(a.at, b.at) || order(a) - order(b));
    return true;
  }

  /** The step and its ticks for the cursor's beat starting at `start`; times are filled in later. */
  private eventsFor(start: Ratio): TalaEvent[] {
    const beat = this.cursor.current();
    if (!beat) return [];
    const variant = this.rng();
    const length = counts(beat);
    const step: StepEvent = { kind: "step", time: 0, at: start, position: this.cursor.position, beat, variant };
    const ticks: TickEvent[] = beat.ticks.map((t) => ({
      kind: "tick",
      time: 0,
      at: add(start, mul(t.offset, length)),
      sound: t.sound,
      variant,
    }));
    return [step, ...ticks];
  }
}

function counts(beat: Beat): Ratio {
  return cmp(beat.duration, MIN_COUNTS) < 0 ? MIN_COUNTS : beat.duration;
}

// At the same position, the step comes before its ticks.
function order(e: TalaEvent): number {
  return e.kind === "step" ? 0 : 1;
}
