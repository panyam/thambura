import type { Sequencer } from "../engine/sequencer";
import type { TempoMap } from "../engine/tempoMap";

/** Calls back on a fixed interval. */
export interface Ticker {
  start(intervalMs: number, onTick: () => void): void;
  stop(): void;
}

/**
 * The look-ahead scheduler. Every `intervalMs` it asks each sequencer for the
 * events due before now + `lookahead` and hands them to that track's handler,
 * which schedules them on the audio clock. The timer only needs to be roughly
 * on time; the audio clock does the precise timing.
 *
 * All tracks start together on one clock. With a TempoMap, they also share
 * one musical timeline: the map puts count 0 at the start time and hears how
 * far each tick has pulled, so a tempo change lands past everything already
 * booked, at the same instant for every track.
 */
export class Transport {
  private readonly tracks: { seq: Sequencer<unknown>; handle: (e: unknown) => void }[] = [];
  private readonly stopListeners: (() => void)[] = [];
  private running = false;

  private readonly tempo: TempoMap | undefined;
  private readonly lookahead: number;
  private readonly intervalMs: number;

  constructor(
    private readonly clock: { readonly now: number },
    private readonly ticker: Ticker,
    opts: { tempo?: TempoMap; lookahead?: number; intervalMs?: number } = {},
  ) {
    this.tempo = opts.tempo;
    this.lookahead = opts.lookahead ?? 0.1;
    this.intervalMs = opts.intervalMs ?? 25;
  }

  get isRunning(): boolean {
    return this.running;
  }

  add<E>(seq: Sequencer<E>, handle: (e: E) => void): void {
    this.tracks.push({ seq, handle: handle as (e: unknown) => void });
  }

  /**
   * Takes a sequencer off the transport, for an instrument leaving the page.
   * It's stopped first if the transport is running, so it books nothing more.
   */
  remove<E>(seq: Sequencer<E>): void {
    const i = this.tracks.findIndex((t) => t.seq === seq);
    if (i < 0) return;
    if (this.running) this.tracks[i].seq.stop(this.clock.now);
    this.tracks.splice(i, 1);
  }

  /**
   * Hears every stop of a running transport, after the sequencers have
   * stopped. For a voice that books sounds without a sequencer of its own,
   * such as the hands track, to take back what hasn't sounded.
   */
  onStop(listener: () => void): void {
    this.stopListeners.push(listener);
  }

  /** Starts every track at `at` (default: a hair from now, so the first step isn't late). */
  start(at = this.clock.now + 0.05): void {
    if (this.running) this.stop();
    this.running = true;
    this.tempo?.start(at);
    for (const t of this.tracks) t.seq.start(at);
    this.tick();
    this.ticker.start(this.intervalMs, () => this.tick());
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.ticker.stop();
    const now = this.clock.now;
    for (const t of this.tracks) t.seq.stop(now);
    this.tempo?.stop();
    for (const f of this.stopListeners) f();
  }

  private tick(): void {
    const now = this.clock.now;
    const until = now + this.lookahead;
    for (const t of this.tracks) {
      for (const e of t.seq.pull(now, until)) t.handle(e);
    }
    this.tempo?.reach(until);
  }
}

const WORKER_SOURCE = `
let id = null;
onmessage = (e) => {
  clearInterval(id);
  id = e.data > 0 ? setInterval(() => postMessage(0), e.data) : null;
};`;

/**
 * A ticker driven from a Web Worker. Browsers throttle a background tab's
 * timers to about once a second, which would starve a 100ms look-ahead;
 * worker timers aren't throttled that way. Falls back to setInterval where
 * workers are unavailable.
 */
export function workerTicker(): Ticker {
  let worker: Worker | null = null;
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
  } catch {
    worker = null;
  }
  if (!worker) return intervalTicker();
  const w = worker;
  return {
    start(ms, onTick) {
      w.onmessage = () => onTick();
      w.postMessage(ms);
    },
    stop() {
      w.postMessage(0);
      w.onmessage = null;
    },
  };
}

export function intervalTicker(): Ticker {
  let id: ReturnType<typeof setInterval> | undefined;
  return {
    start(ms, onTick) {
      clearInterval(id);
      id = setInterval(onTick, ms);
    },
    stop() {
      clearInterval(id);
      id = undefined;
    },
  };
}
