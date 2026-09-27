import { PluckRender } from "../engine/tambura";
import type { PluckJob, PluckReply, PluckRequest } from "./pluckWorkerCore";

export type { PluckJob } from "./pluckWorkerCore";

/**
 * Renders plucks for a thambura. `render` calls `done` with the samples,
 * never on the caller's own call, and returns a cancel: after it, `done` is
 * never called. Cancelling a finished or cancelled job does nothing.
 */
export interface PluckRenderer {
  render(job: PluckJob, done: (samples: Float32Array) => void): () => void;
}

/** Runs `cb` after `ms`, outside the current call; returns a cancel. */
export type Defer = (cb: () => void, ms: number) => () => void;

// Work per deferred call, in harmonic-samples (see PluckRender.step): about
// 8 ms on a fast desktop since #38, and so still inside the transport's 75 ms
// margin on a phone, which is 2-4x slower.
const RENDER_BUDGET = 6_000_000;

/**
 * Renders on the main thread, one job at a time and a slice per deferred
 * call, since a whole 9 s tambura pluck would stall the transport past its
 * margin and make the tala late. It's the fallback when there are no
 * workers.
 */
export class SlicedRenderer implements PluckRenderer {
  private readonly queue: { job: PluckJob; done: (s: Float32Array) => void; render?: PluckRender }[] = [];
  private waiting = false;

  constructor(
    private readonly defer: Defer,
    private readonly budget = RENDER_BUDGET,
  ) {}

  render(job: PluckJob, done: (samples: Float32Array) => void): () => void {
    const task = { job, done };
    this.queue.push(task);
    this.schedule();
    return () => {
      const at = this.queue.indexOf(task);
      if (at >= 0) this.queue.splice(at, 1);
    };
  }

  private schedule(): void {
    if (this.waiting || this.queue.length === 0) return;
    this.waiting = true;
    this.defer(() => {
      this.waiting = false;
      this.slice();
      this.schedule();
    }, 0);
  }

  private slice(): void {
    const task = this.queue[0];
    if (!task) return;
    const { hz, sampleRate, voice, seed } = task.job;
    task.render ??= new PluckRender(hz, sampleRate, voice, seed);
    if (!task.render.step(this.budget)) return;
    this.queue.shift();
    task.done(task.render.result());
  }
}

/** The part of a Worker the pool uses, so tests can stand in for it. */
export interface WorkerLike {
  postMessage(msg: PluckRequest): void;
  onmessage: ((e: { data: PluckReply }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

interface PoolTask {
  id: number;
  job: PluckJob;
  done: (s: Float32Array) => void;
  cancelled: boolean;
  // Set once the task has gone to the fallback renderer.
  fallbackCancel?: () => void;
}

/**
 * Renders on a pool of up to `size` workers, one job per worker, the rest
 * queued. Workers start on the first render, not with the page, and stay.
 * A cancelled job that hasn't started is dropped; a running one is told to
 * stop, which a worker notices within a slice, and its reply is ignored.
 * If a worker can't be made or fails, every job it had, every queued job and
 * every later one go to `fallback`.
 */
export class WorkerPoolRenderer implements PluckRenderer {
  private readonly slots: { worker: WorkerLike; task: PoolTask | null }[] = [];
  private readonly queue: PoolTask[] = [];
  private broken = false;
  private nextId = 1;

  constructor(
    private readonly spawn: () => WorkerLike,
    private readonly size: number,
    private readonly fallback: PluckRenderer,
  ) {}

  render(job: PluckJob, done: (samples: Float32Array) => void): () => void {
    if (this.broken) return this.fallback.render(job, done);
    const task: PoolTask = { id: this.nextId++, job, done, cancelled: false };
    this.queue.push(task);
    this.pump();
    return () => this.cancel(task);
  }

  private cancel(task: PoolTask): void {
    if (task.cancelled) return;
    task.cancelled = true;
    if (task.fallbackCancel) {
      task.fallbackCancel();
      return;
    }
    const at = this.queue.indexOf(task);
    if (at >= 0) {
      this.queue.splice(at, 1);
      return;
    }
    // Running: the worker stays busy until it replies.
    this.slots.find((s) => s.task === task)?.worker.postMessage({ type: "cancel", id: task.id });
  }

  private pump(): void {
    while (this.queue.length && !this.broken) {
      const slot = this.slots.find((s) => !s.task) ?? this.addSlot();
      if (!slot) return;
      const task = this.queue.shift()!;
      slot.task = task;
      slot.worker.postMessage({ type: "render", id: task.id, job: task.job });
    }
  }

  private addSlot(): (typeof this.slots)[number] | null {
    if (this.slots.length >= this.size) return null;
    let worker: WorkerLike;
    try {
      worker = this.spawn();
    } catch {
      this.fail();
      return null;
    }
    const slot = { worker, task: null as PoolTask | null };
    worker.onmessage = (e) => {
      const task = slot.task;
      if (!task || task.id !== e.data.id) return;
      slot.task = null;
      if (!task.cancelled && e.data.samples) task.done(e.data.samples);
      this.pump();
    };
    worker.onerror = () => this.fail();
    this.slots.push(slot);
    return slot;
  }

  /** Hands every job not yet done to the fallback, now and from now on. */
  private fail(): void {
    if (this.broken) return;
    this.broken = true;
    const tasks = [...this.slots.map((s) => s.task), ...this.queue].filter((t): t is PoolTask => !!t && !t.cancelled);
    this.queue.length = 0;
    for (const s of this.slots) s.task = null;
    for (const t of tasks) t.fallbackCancel = this.fallback.render(t.job, t.done);
  }
}

// The worker bundle, built by build.mjs beside app.js and embed.js.
const WORKER_PATH = "/static/pluckWorker.js";

/**
 * The page's renderer: a pool of pluck workers, one fewer than the cores
 * (at most four, one per string), falling back to `SlicedRenderer` on
 * `defer`. The worker comes from the origin this script was loaded from.
 * When another site embeds us that origin isn't the page's, and a browser
 * won't start a worker from another origin, so a same-origin blob worker
 * loads the script with `importScripts`.
 */
export function browserPluckRenderer(defer: Defer): PluckRenderer {
  const fallback = new SlicedRenderer(defer);
  if (typeof Worker === "undefined") return fallback;
  const size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const url = new URL(WORKER_PATH, import.meta.url);
  let source: string | undefined;
  // A Worker's message events carry more than `data`, which is all the pool reads.
  const spawn = (): WorkerLike => {
    if (url.origin === location.origin) return new Worker(url) as unknown as WorkerLike;
    source ??= URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(url.href)});`], { type: "text/javascript" }));
    return new Worker(source) as unknown as WorkerLike;
  };
  return new WorkerPoolRenderer(spawn, size, fallback);
}
