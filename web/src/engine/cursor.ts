import type { Beat } from "./beat";

/** A place in the cycle: which beat, and which of its kalai repeats. */
export interface Position {
  beat: number;
  repeat: number;
}

/**
 * Walks a beat list, playing each beat `repeat` times (the kalai) before moving
 * on, and wrapping at both ends.
 */
export class BeatCursor {
  private beats: Beat[] = [];
  private beatIndex = 0;
  private repeatIndex = 0;
  private repeatCount = 1;

  constructor(beats: Beat[] = [], repeat = 1) {
    this.setBeats(beats);
    this.setRepeat(repeat);
  }

  get length(): number {
    return this.beats.length;
  }

  get position(): Position {
    return { beat: this.beatIndex, repeat: this.repeatIndex };
  }

  current(): Beat | null {
    return this.beats[this.beatIndex] ?? null;
  }

  /** Replaces the beat list and goes back to the start. */
  setBeats(beats: Beat[]): void {
    this.beats = beats;
    this.first();
  }

  setRepeat(count: number): void {
    this.repeatCount = Math.max(1, Math.floor(count));
    if (this.repeatIndex >= this.repeatCount) this.repeatIndex = this.repeatCount - 1;
  }

  first(): void {
    this.beatIndex = 0;
    this.repeatIndex = 0;
  }

  last(): void {
    this.beatIndex = Math.max(0, this.beats.length - 1);
    this.repeatIndex = this.repeatCount - 1;
  }

  seek(pos: Position): void {
    if (this.beats.length === 0) return;
    this.beatIndex = mod(pos.beat, this.beats.length);
    this.repeatIndex = Math.min(Math.max(0, pos.repeat), this.repeatCount - 1);
  }

  forward(): void {
    if (this.beats.length === 0) return;
    this.repeatIndex++;
    if (this.repeatIndex >= this.repeatCount) {
      this.repeatIndex = 0;
      this.beatIndex = (this.beatIndex + 1) % this.beats.length;
    }
  }

  backward(): void {
    if (this.beats.length === 0) return;
    this.repeatIndex--;
    if (this.repeatIndex < 0) {
      this.repeatIndex = this.repeatCount - 1;
      this.beatIndex = mod(this.beatIndex - 1, this.beats.length);
    }
  }
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
