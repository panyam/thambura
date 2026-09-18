import type { Beat } from "./beat";
import type { BeatCursor, Position } from "./cursor";

/**
 * Tempo shared by every rhythmic voice, so the tala and (later) the mridangam
 * stay on one beat grid. Mutable: a change applies from the next step each
 * sequencer emits.
 */
export interface Tempo {
  bpm: number;
}

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

export interface SoundAt {
  sound: string;
  time: number;
}

/** One tala step: a beat, when it starts, and the sounds struck in it. */
export interface StepEvent {
  time: number;
  duration: number;
  position: Position;
  beat: Beat;
  sounds: SoundAt[];
  /**
   * A uniform draw in [0, 1), made once per step. Random asset groups (the
   * SaRiGaMa "randomness mode") use it to pick this step's image and sound, so
   * both come from the same draw.
   */
  variant: number;
}

export function secondsPerCount(tempo: Tempo): number {
  return 60 / tempo.bpm;
}

/** Emits the tala's steps from a BeatCursor at the shared tempo. */
export class TalaSequencer implements Sequencer<StepEvent> {
  private nextTime: number | null = null;
  // Steps already handed out that had not started at the last pull. Stop uses
  // them to rewind the cursor to the first step the student has not heard yet.
  private pending: StepEvent[] = [];

  constructor(
    private readonly cursor: BeatCursor,
    private readonly tempo: Tempo,
    private readonly rng: () => number = Math.random,
  ) {}

  get running(): boolean {
    return this.nextTime !== null;
  }

  start(at: number): void {
    this.nextTime = at;
    this.pending = [];
  }

  stop(now: number): void {
    const unheard = this.pending.find((e) => e.time > now);
    if (unheard) this.cursor.seek(unheard.position);
    this.nextTime = null;
    this.pending = [];
  }

  pull(now: number, until: number): StepEvent[] {
    const out: StepEvent[] = [];
    while (this.nextTime !== null && this.nextTime < until) {
      const ev = this.stepAt(this.nextTime);
      if (!ev) break;
      out.push(ev);
      this.nextTime += ev.duration;
      this.cursor.forward();
    }
    this.pending = this.pending.filter((e) => e.time > now).concat(out);
    return out;
  }

  /**
   * The step for the cursor's current beat if it started at `time`, without
   * advancing. Manual stepping (prev/next/restart) plays one of these.
   */
  stepAt(time: number): StepEvent | null {
    const beat = this.cursor.current();
    if (!beat) return null;
    // A zero-length beat would stall the pull loop.
    const duration = Math.max(beat.duration, 1e-3) * secondsPerCount(this.tempo);
    return {
      time,
      duration,
      position: this.cursor.position,
      beat,
      sounds: beat.ticks.map((t) => ({ sound: t.sound, time: time + t.offset * duration })),
      variant: this.rng(),
    };
  }
}
