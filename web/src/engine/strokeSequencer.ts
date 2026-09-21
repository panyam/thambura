import { add, cmp, ZERO, type Ratio } from "./ratio";
import type { Sequencer } from "./sequencer";
import type { TalaGrid } from "./talaGrid";
import { strokeCount, type Pattern } from "./patterns";
import type { TempoMap } from "./tempoMap";

/** One stroke to play, on the audio clock. */
export interface StrokeEvent {
  time: number;
  /** Musical position: counts since the transport started. */
  at: Ratio;
  /** A stroke id from the kit, such as `R.chapu`. */
  stroke: string;
  gain: number;
  /** Which cycle of the tala it belongs to, for the view and for korvais. */
  cycle: number;
}

/** What the sequencer plays, asked afresh at each cycle so settings can change. */
export interface StrokeSource {
  grid: TalaGrid;
  pattern: Pattern | null;
}

/**
 * Plays a pattern against the tala, cycle by cycle, on the tala's own
 * `TempoMap`. Positions come from the pattern in aksharas and are scaled by
 * the grid, so the strokes and the claps are the same musical points and can't
 * drift apart. A tempo change reaches every stroke not yet handed out, as it
 * does for the tala's ticks.
 *
 * With no pattern for the current tala it plays nothing and says so by
 * emitting nothing, rather than guessing at an accompaniment.
 */
export class StrokeSequencer implements Sequencer<StrokeEvent> {
  private running = false;
  /** Where the next cycle starts, in counts, and which cycle that is. */
  private nextCycleAt: Ratio = ZERO;
  private cycle = 0;
  /** This cycle's strokes, in musical order, not yet handed out. */
  private queue: StrokeEvent[] = [];

  constructor(
    private readonly source: () => StrokeSource,
    private readonly tempo: TempoMap,
  ) {}

  start(_at: number): void {
    this.running = true;
    this.nextCycleAt = ZERO;
    this.cycle = 0;
    this.queue = [];
  }

  stop(_now: number): void {
    this.running = false;
    this.queue = [];
  }

  pull(_now: number, until: number): StrokeEvent[] {
    const out: StrokeEvent[] = [];
    while (this.running) {
      const head = this.queue[0];
      if (!head) {
        if (this.tempo.secondsAt(this.nextCycleAt) >= until || !this.queueCycle()) break;
        continue;
      }
      const time = this.tempo.secondsAt(head.at);
      if (time >= until) break;
      head.time = time;
      out.push(head);
      this.queue.shift();
    }
    return out;
  }

  /** Lays the next cycle's strokes out in counts. False when there's nothing to play. */
  private queueCycle(): boolean {
    const { grid, pattern } = this.source();
    const cycleCounts = grid.cycleCounts;
    if (cycleCounts.n <= 0) return false;
    const start = this.nextCycleAt;
    if (pattern) {
      const perBeat = grid.countsPerBeat;
      this.queue = pattern.strokes.map((s) => ({
        time: 0,
        at: add(start, strokeCount(s, perBeat)),
        stroke: s.stroke,
        gain: s.gain,
        cycle: this.cycle,
      }));
      this.queue.sort((a, b) => cmp(a.at, b.at));
    }
    this.nextCycleAt = add(start, cycleCounts);
    this.cycle++;
    // An empty cycle (no pattern) still advances, so the tala can carry on
    // and a pattern chosen mid-play starts at the next cycle boundary.
    return true;
  }
}
