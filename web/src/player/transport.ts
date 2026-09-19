import type { Sequencer } from "../engine/sequencer";

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
 * All tracks start together on one clock, so a mridangam sequencer added later
 * lands on the same grid as the tala.
 */
export class Transport {
  private readonly tracks: { seq: Sequencer<unknown>; handle: (e: unknown) => void }[] = [];
  private running = false;

  constructor(
    private readonly clock: { readonly now: number },
    private readonly ticker: Ticker,
    private readonly lookahead = 0.1,
    private readonly intervalMs = 25,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  add<E>(seq: Sequencer<E>, handle: (e: E) => void): void {
    this.tracks.push({ seq, handle: handle as (e: unknown) => void });
  }

  /** Starts every track at `at` (default: a hair from now, so the first step isn't late). */
  start(at = this.clock.now + 0.05): void {
    if (this.running) this.stop();
    this.running = true;
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
  }

  private tick(): void {
    const now = this.clock.now;
    for (const t of this.tracks) {
      for (const e of t.seq.pull(now, now + this.lookahead)) t.handle(e);
    }
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
