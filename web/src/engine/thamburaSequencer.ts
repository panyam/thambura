import type { Sequencer } from "./sequencer";

/** One string plucked at an audio-clock time. */
export interface PluckEvent {
  time: number;
  /** 0 is the first string, 1 and 2 the Sa strings, 3 the low Sa. */
  string: number;
  /** 0.85-1: how hard, so repeated plucks aren't identical. */
  gain: number;
}

/** A string stopped by a finger before it's plucked again. */
export interface DampEvent {
  time: number;
  string: number;
  damp: true;
}

export type ThamburaEvent = PluckEvent | DampEvent;

/** How a player spaces the plucks in a round. */
export interface PluckPattern {
  /** The gap after each string's pluck, as shares of the round. They sum to 1. */
  gaps: readonly number[];
  /**
   * How long before its next pluck each string is damped, as shares of the
   * round, or null to let strings ring until they're plucked again. Each must
   * be shorter than the gap before that string's pluck.
   */
  damp: readonly number[] | null;
}

/** Five equal slots: four plucks, then a rest before the first string again. */
export const EVEN_PATTERN: PluckPattern = { gaps: [1 / 5, 1 / 5, 1 / 5, 2 / 5], damp: null };

/**
 * After the player in the recording from issue #8 (docs/sound-analysis.md), whose
 * round was 5.8 s: 30% of the round from the first string to Sa and 29% from
 * the low Sa back to the first string. The recording spaced the two Sa strings
 * 24% and 18% apart; here they share that time evenly, since by ear the first
 * Sa's longer note stood out. Each string is stopped 9-16% of the round before
 * its next pluck (measured for the first string and the low Sa; the Sa strings,
 * which the low Sa's harmonics hide, are set between).
 */
export const PLAYED_PATTERN: PluckPattern = { gaps: [0.3, 0.205, 0.205, 0.29], damp: [0.09, 0.12, 0.12, 0.16] };

/** The thambura's speed and pattern. Mutable: a change applies from the next event not yet handed out. */
export interface ThamburaTiming {
  cycleSeconds: number;
  /** Defaults to EVEN_PATTERN. */
  pattern?: PluckPattern;
}

const STRINGS = 4;
// Up to 0.4% of the round late, and up to 15% softer, drawn per pluck.
const JITTER = 0.004;
const SOFTER = 0.15;

/**
 * Plucks the four strings in turn on the audio clock and, when the pattern
 * damps, stops each string shortly before it's plucked again. It runs on its
 * own speed, not the tala's tempo. The next event's time is worked out from
 * the last pluck only when it is asked for, so a speed change is heard at once.
 */
export class ThamburaSequencer implements Sequencer<ThamburaEvent> {
  private running = false;
  // Where the first pluck goes after start; null once it has been handed out.
  private startAt: number | null = null;
  // The last pluck's grid time (before its jitter) and the string plucked next.
  private lastTime = 0;
  private next = 0;
  // Whether the next string's damp is handed out, and which strings have sounded since start.
  private damped = false;
  private sounding = [false, false, false, false];
  // Which string the next start begins with (see startWith).
  private first = 0;

  constructor(
    private readonly timing: ThamburaTiming,
    private readonly rng: () => number = Math.random,
  ) {}

  /**
   * The string the next `start` begins with; the round carries on in order
   * from there. The Lab uses it to restart from the first string still
   * playing, so an edit is heard at once rather than a round later.
   */
  startWith(string: number): void {
    this.first = string;
  }

  start(at: number): void {
    this.running = true;
    this.startAt = at;
    this.next = this.first;
    this.first = 0;
    this.damped = false;
    this.sounding = [false, false, false, false];
  }

  stop(_now: number): void {
    this.running = false;
  }

  pull(_now: number, until: number): ThamburaEvent[] {
    const out: ThamburaEvent[] = [];
    while (this.running) {
      const cycle = this.timing.cycleSeconds;
      const { gaps, damp } = this.timing.pattern ?? EVEN_PATTERN;
      const t = this.startAt ?? this.lastTime + gaps[(this.next + STRINGS - 1) % STRINGS] * cycle;
      if (damp && !this.damped) {
        const at = t - damp[this.next] * cycle;
        if (at >= until) break;
        if (this.sounding[this.next]) out.push({ time: at, string: this.next, damp: true });
        this.damped = true;
        continue;
      }
      if (t >= until) break;
      out.push({ time: t + JITTER * cycle * this.rng(), string: this.next, gain: 1 - SOFTER * this.rng() });
      this.sounding[this.next] = true;
      this.startAt = null;
      this.lastTime = t;
      this.damped = false;
      this.next = (this.next + 1) % STRINGS;
    }
    return out;
  }
}
