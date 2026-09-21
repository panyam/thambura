import type { Beat } from "./beat";
import { add, cmp, mul, ratio, toNumber, ZERO, type Ratio } from "./ratio";

/**
 * Where a point in musical time falls inside the tala. Anything that plays
 * along with the tala needs this: a stroke sequencer to know where a cycle
 * starts, and eduppu and korvai to land on the right akshara.
 *
 * Musical time is counts since the transport started, as exact ratios, the
 * same units `TempoMap` turns into seconds. One akshara is one beat of the
 * cycle, repeated kalai times, so at kalai 2 an akshara lasts two counts.
 */
export interface GridPosition {
  /** How many whole cycles have passed. */
  cycle: number;
  /** Which beat of the cycle, and which of its kalai repeats. */
  beat: number;
  repeat: number;
  /** How far into that akshara, in counts. */
  into: Ratio;
}

export class TalaGrid {
  /** Where each akshara of one cycle starts, in counts from the cycle start. */
  private readonly starts: Ratio[] = [];
  private readonly cycle: Ratio;

  constructor(
    private readonly beats: Beat[],
    private readonly kalai = 1,
  ) {
    let at: Ratio = ZERO;
    for (let beat = 0; beat < beats.length; beat++) {
      for (let repeat = 0; repeat < Math.max(1, kalai); repeat++) {
        this.starts.push(at);
        at = add(at, beats[beat].duration);
      }
    }
    this.cycle = at;
  }

  /** The whole cycle's length, in counts. Zero for an empty tala. */
  get cycleCounts(): Ratio {
    return this.cycle;
  }

  /** How many beats the cycle has, ignoring kalai. */
  get beatCount(): number {
    return this.beats.length;
  }

  /**
   * The cycle written as its beats: "down one two three down open down open"
   * for Adi. Patterns are matched on this rather than on a count, because
   * counting alone confuses talas that share a length. Adi and a
   * chatusra-jaathi Thriputa are the same eight beats and take the same
   * accompaniment; Matya in thisram is also eight beats, but its claps and
   * waves fall elsewhere, so a sarvalaghu written for Adi would put thom where
   * there is no sam.
   */
  get shape(): string {
    return this.beats.map((b) => b.image).join(" ");
  }

  /** How many aksharas a cycle has, kalai included. */
  get aksharaCount(): number {
    return this.starts.length;
  }

  /**
   * Whether every akshara is the same length, which a pattern written in
   * aksharas needs. Sapta and custom talas are; a chaapu is one long beat.
   */
  get uniform(): boolean {
    return this.beats.every((b) => cmp(b.duration, this.beats[0].duration) === 0);
  }

  /**
   * How many counts one beat of the cycle lasts, kalai included, which is
   * what a pattern written per beat is scaled by. At kalai 2 a beat is played
   * twice, so the pattern stretches over both. Only meaningful when `uniform`.
   */
  get countsPerBeat(): Ratio {
    return mul(this.beats[0]?.duration ?? ZERO, ratio(Math.max(1, this.kalai)));
  }

  /**
   * The cycle's length ignoring kalai, which is what a pattern is written
   * against. At kalai 2 the cycle takes twice as long, but it is the same
   * eight aksharas, so the same pattern fits and simply stretches.
   */
  get patternCounts(): Ratio {
    return mul(this.cycle, ratio(1, Math.max(1, this.kalai)));
  }

  /** Where a cycle starts, in counts since the transport started. */
  cycleStart(cycle: number): Ratio {
    return mul(this.cycle, ratio(cycle));
  }

  /** Where an akshara starts, in counts from its own cycle's start. */
  aksharaStart(index: number): Ratio {
    return this.starts[mod(index, Math.max(1, this.starts.length))] ?? ZERO;
  }

  /** Which cycle, akshara and offset a count falls in. */
  at(count: Ratio): GridPosition {
    if (this.starts.length === 0 || toNumber(this.cycle) <= 0) {
      return { cycle: 0, beat: 0, repeat: 0, into: ZERO };
    }
    const counts = toNumber(count);
    const cycle = Math.floor(counts / toNumber(this.cycle));
    const within = add(count, mul(this.cycle, ratio(-cycle)));
    let index = 0;
    for (let i = 0; i < this.starts.length; i++) {
      if (cmp(this.starts[i], within) <= 0) index = i;
      else break;
    }
    const repeats = Math.max(1, this.kalai);
    return {
      cycle,
      beat: Math.floor(index / repeats),
      repeat: index % repeats,
      into: add(within, mul(this.starts[index], ratio(-1))),
    };
  }
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
