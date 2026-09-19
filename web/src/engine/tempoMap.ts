import { toNumber, type Ratio } from "./ratio";

/**
 * Turns musical time into audio-clock seconds for every rhythmic voice on one
 * transport, so the tala and the mridangam change tempo at the same instant
 * and can't drift apart. Musical time is counts since the transport started
 * (one count is one tempo beat, 60/bpm seconds), as exact ratios.
 *
 * The transport reports how far ahead it has pulled (`reach`). Every event
 * before that horizon has been handed out and booked on the audio clock, so a
 * tempo change takes effect at the horizon: nothing booked moves, and the new
 * tempo is heard within one look-ahead window. Since nothing before the
 * horizon is asked for again, one anchor is all the map keeps.
 */
export class TempoMap {
  private tempo: number;
  // The musical position (in counts, as a float) at an audio time, and the
  // seconds per count from there on. Null while stopped.
  private anchor: { count: number; seconds: number } | null = null;
  private horizon = 0;

  constructor(bpm: number) {
    this.tempo = bpm;
  }

  get bpm(): number {
    return this.tempo;
  }

  get secondsPerCount(): number {
    return 60 / this.tempo;
  }

  /** Puts count 0 at `at` on the audio clock. */
  start(at: number): void {
    this.anchor = { count: 0, seconds: at };
    this.horizon = at;
  }

  stop(): void {
    this.anchor = null;
  }

  /** Everything before `until` has now been handed out. */
  reach(until: number): void {
    this.horizon = Math.max(this.horizon, until);
  }

  /** Changes the tempo from the horizon on, or from the next start when stopped. */
  setTempo(bpm: number): void {
    if (this.anchor) {
      const seconds = Math.max(this.horizon, this.anchor.seconds);
      const count = this.anchor.count + (seconds - this.anchor.seconds) / this.secondsPerCount;
      this.anchor = { count, seconds };
    }
    this.tempo = bpm;
  }

  /** The audio time of a musical position. Only valid while started. */
  secondsAt(pos: Ratio): number {
    const a = this.anchor;
    if (!a) throw new Error("TempoMap: not started");
    return a.seconds + (toNumber(pos) - a.count) * this.secondsPerCount;
  }
}
