import type { Sequencer } from "./sequencer";

/** One string plucked at an audio-clock time. */
export interface PluckEvent {
  time: number;
  /** 0 is the first string, 1 and 2 the Sa strings, 3 the low Sa. */
  string: number;
  /** 0.85-1: how hard, so repeated plucks aren't identical. */
  gain: number;
}

/** The thambura's speed. Mutable: a change applies from the next pluck not yet handed out. */
export interface ThamburaTiming {
  cycleSeconds: number;
}

// A cycle has five equal slots: four plucks, then a rest before the first string again.
const SLOTS = 5;
const STRINGS = 4;
// Up to 2% of a slot late, and up to 15% softer, drawn per pluck.
const JITTER = 0.02;
const SOFTER = 0.15;

/**
 * Plucks the four strings in turn on the audio clock. It runs on its own
 * speed, not the tala's tempo. The next pluck's time is worked out from the
 * last one only when it is asked for, so a speed change is heard at once.
 */
export class ThamburaSequencer implements Sequencer<PluckEvent> {
  private running = false;
  // Where the first pluck goes after start; null once it has been handed out.
  private startAt: number | null = null;
  // The last pluck's grid time (before its jitter) and the string plucked next.
  private lastTime = 0;
  private next = 0;

  constructor(
    private readonly timing: ThamburaTiming,
    private readonly rng: () => number = Math.random,
  ) {}

  start(at: number): void {
    this.running = true;
    this.startAt = at;
    this.next = 0;
  }

  stop(_now: number): void {
    this.running = false;
  }

  pull(_now: number, until: number): PluckEvent[] {
    const out: PluckEvent[] = [];
    while (this.running) {
      const slot = this.timing.cycleSeconds / SLOTS;
      const t = this.startAt ?? this.lastTime + (this.next === 0 ? 2 : 1) * slot;
      if (t >= until) break;
      out.push({ time: t + JITTER * slot * this.rng(), string: this.next, gain: 1 - SOFTER * this.rng() });
      this.startAt = null;
      this.lastTime = t;
      this.next = (this.next + 1) % STRINGS;
    }
    return out;
  }
}
