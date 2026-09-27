import { PluckRender, type PluckVoice } from "../engine/tambura";

/** One string's pluck to render: `renderPluck`'s arguments. */
export interface PluckJob {
  hz: number;
  sampleRate: number;
  voice: PluckVoice;
  seed: number;
}

/** What the page sends a pluck worker. */
export type PluckRequest = { type: "render"; id: number; job: PluckJob } | { type: "cancel"; id: number };

/**
 * What a pluck worker sends back, once per render request: the samples, or
 * the id alone for a job cancelled before it finished.
 */
export interface PluckReply {
  id: number;
  samples?: Float32Array;
}

// Work per slice in the worker, in harmonic-samples: about 4 ms on a fast
// desktop, so a cancel waits at most that long for the worker to notice.
const WORKER_BUDGET = 3_000_000;

/**
 * The inside of a pluck worker (src/pluckWorker.ts), apart from the worker
 * so it can run in tests. Returns the message handler. It renders one job at
 * a time, a slice per `later` callback, so a cancel sent mid-render is read
 * between slices instead of after the whole pluck. The samples are the same
 * as `renderPluck`'s, and their buffer is transferred, not copied.
 */
export function pluckWorker(
  post: (reply: PluckReply, transfer: Transferable[]) => void,
  later: (cb: () => void) => void,
  budget = WORKER_BUDGET,
): (msg: PluckRequest) => void {
  const queue: { id: number; job: PluckJob }[] = [];
  let current: { id: number; render: PluckRender; cancelled: boolean } | null = null;
  let scheduled = false;
  const schedule = () => {
    if (scheduled || (!current && !queue.length)) return;
    scheduled = true;
    later(slice);
  };

  const slice = () => {
    scheduled = false;
    if (!current) {
      const next = queue.shift();
      if (!next) return;
      const { hz, sampleRate, voice, seed } = next.job;
      current = { id: next.id, render: new PluckRender(hz, sampleRate, voice, seed), cancelled: false };
    }
    if (current.cancelled) {
      post({ id: current.id }, []);
      current = null;
    } else if (current.render.step(budget)) {
      const samples = current.render.result();
      post({ id: current.id, samples }, [samples.buffer]);
      current = null;
    }
    schedule();
  };

  return (msg) => {
    if (msg.type === "render") {
      queue.push({ id: msg.id, job: msg.job });
      schedule();
      return;
    }
    if (current?.id === msg.id) {
      current.cancelled = true;
      return;
    }
    const at = queue.findIndex((q) => q.id === msg.id);
    if (at >= 0) {
      queue.splice(at, 1);
      post({ id: msg.id }, []);
    }
  };
}
