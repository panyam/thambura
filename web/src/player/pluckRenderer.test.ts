import { describe, expect, it } from "vitest";
import { DEFAULT_THAMBURA } from "../engine/shruthi";
import { pluckVoice, renderPluck } from "../engine/tambura";
import { SlicedRenderer, WorkerPoolRenderer, type PluckJob, type PluckRenderer, type WorkerLike } from "./pluckRenderer";
import { pluckWorker, type PluckReply, type PluckRequest } from "./pluckWorkerCore";

const SR = 8000;
const job = (hz: number, seed = 1): PluckJob => ({ hz, sampleRate: SR, voice: pluckVoice({ ...DEFAULT_THAMBURA, mode: "guitar" }), seed });

/** A worker that records what it's sent and replies when the test says. */
class FakeWorker implements WorkerLike {
  sent: PluckRequest[] = [];
  onmessage: ((e: { data: PluckReply }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(m: PluckRequest) {
    this.sent.push(m);
  }
  /** The render requests it's been sent, in order. */
  get renders() {
    return this.sent.filter((m) => m.type === "render");
  }
  reply(id: number, samples?: Float32Array) {
    this.onmessage?.({ data: samples ? { id, samples } : { id } });
  }
}

/** A renderer that records jobs and never finishes them unless told to. */
class HeldRenderer implements PluckRenderer {
  jobs: { job: PluckJob; done: (s: Float32Array) => void; cancelled: boolean }[] = [];
  render(job: PluckJob, done: (s: Float32Array) => void) {
    const entry = { job, done, cancelled: false };
    this.jobs.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }
}

describe("WorkerPoolRenderer", () => {
  const pool = (size: number) => {
    const workers: FakeWorker[] = [];
    const fallback = new HeldRenderer();
    const r = new WorkerPoolRenderer(
      () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
      size,
      fallback,
    );
    return { r, workers, fallback };
  };

  it("starts no worker until it has something to render", () => {
    const { workers } = pool(3);
    expect(workers).toHaveLength(0);
  });

  it("runs at most one job per worker and at most `size` workers, queueing the rest", () => {
    const { r, workers } = pool(2);
    const got: number[] = [];
    for (let i = 0; i < 4; i++) r.render(job(100 + i), () => got.push(i));
    expect(workers).toHaveLength(2);
    expect(workers.map((w) => w.renders.length)).toEqual([1, 1]);
    const first = workers[0].renders[0];
    workers[0].reply(first.id, new Float32Array(1));
    expect(got).toEqual([0]);
    // The freed worker takes the next job in the queue.
    expect(workers[0].renders).toHaveLength(2);
    expect(workers[0].renders[1].job.hz).toBe(102);
    expect(workers).toHaveLength(2);
  });

  it("drops a queued job on cancel without ever sending it", () => {
    const { r, workers } = pool(1);
    r.render(job(100), () => {});
    const cancel = r.render(job(200), () => {
      throw new Error("a cancelled job finished");
    });
    cancel();
    workers[0].reply(workers[0].renders[0].id, new Float32Array(1));
    expect(workers[0].renders.map((m) => m.job.hz)).toEqual([100]);
  });

  it("tells a worker to stop a running job, ignores its reply, and gives the worker the next job", () => {
    const { r, workers } = pool(1);
    const got: number[] = [];
    const cancel = r.render(job(100), () => got.push(100));
    r.render(job(200), () => got.push(200));
    cancel();
    const w = workers[0];
    const id = w.renders[0].id;
    expect(w.sent.at(-1)).toEqual({ type: "cancel", id });
    // The worker was mid-render: it may still send samples, or just the id.
    w.reply(id, new Float32Array(1));
    expect(got).toEqual([]);
    expect(w.renders.map((m) => m.job.hz)).toEqual([100, 200]);
    w.reply(w.renders[1].id, new Float32Array(1));
    expect(got).toEqual([200]);
  });

  it("renders in-thread when a worker can't be made, then and from then on", () => {
    const fallback = new HeldRenderer();
    const r = new WorkerPoolRenderer(
      () => {
        throw new Error("blocked by the page's CSP");
      },
      2,
      fallback,
    );
    r.render(job(100), () => {});
    r.render(job(200), () => {});
    expect(fallback.jobs.map((j) => j.job.hz)).toEqual([100, 200]);
  });

  it("moves a failed worker's running and queued jobs to the fallback, and cancels reach them there", () => {
    const { r, workers, fallback } = pool(1);
    const got: number[] = [];
    r.render(job(100), () => got.push(100));
    const cancel200 = r.render(job(200), () => got.push(200));
    workers[0].onerror?.(new Error("script failed to load"));
    expect(fallback.jobs.map((j) => j.job.hz)).toEqual([100, 200]);
    cancel200();
    expect(fallback.jobs[1].cancelled).toBe(true);
    fallback.jobs[0].done(new Float32Array(1));
    expect(got).toEqual([100]);
    r.render(job(300), () => {});
    expect(fallback.jobs).toHaveLength(3);
    expect(workers).toHaveLength(1);
  });

  it("gives the same samples as renderPluck through a real worker core", async () => {
    const fallback = new HeldRenderer();
    const r = new WorkerPoolRenderer(() => inProcessWorker(), 2, fallback);
    const jobs = [job(130.8128, 1), job(196.0, 2), job(65.4064, 4)];
    const out = await Promise.all(jobs.map((j) => new Promise<Float32Array>((resolve) => r.render(j, resolve))));
    jobs.forEach((j, i) => expect(out[i]).toEqual(renderPluck(j.hz, j.sampleRate, j.voice, j.seed)));
    expect(fallback.jobs).toHaveLength(0);
  });
});

describe("SlicedRenderer", () => {
  const sliced = (budget: number) => {
    const deferred: (() => void)[] = [];
    const r = new SlicedRenderer(
      (cb) => {
        deferred.push(cb);
        return () => {};
      },
      budget,
    );
    const flush = () => {
      let calls = 0;
      while (deferred.length) {
        deferred.shift()!();
        calls++;
      }
      return calls;
    };
    return { r, deferred, flush };
  };

  it("renders a slice per deferred call, one job at a time, the same samples as in one go", () => {
    const { r, flush } = sliced(50_000);
    const got: Float32Array[] = [];
    const a = job(130.8128, 1);
    const b = job(196.0, 2);
    r.render(a, (s) => got.push(s));
    r.render(b, (s) => got.push(s));
    expect(got).toHaveLength(0); // nothing on the caller's call
    expect(flush()).toBeGreaterThan(4);
    expect(got).toHaveLength(2);
    expect(got[0]).toEqual(renderPluck(a.hz, SR, a.voice, 1));
    expect(got[1]).toEqual(renderPluck(b.hz, SR, b.voice, 2));
  });

  it("drops a job cancelled part way and goes on to the next", () => {
    const { r, deferred, flush } = sliced(50_000);
    const got: number[] = [];
    const cancel = r.render(job(130.8128), () => got.push(1));
    r.render(job(196.0), () => got.push(2));
    deferred.shift()!();
    cancel();
    flush();
    expect(got).toEqual([2]);
  });
});

describe("pluckWorker", () => {
  const worker = () => {
    const replies: { reply: PluckReply; transfer: Transferable[] }[] = [];
    const later: (() => void)[] = [];
    const handle = pluckWorker(
      (reply, transfer) => replies.push({ reply, transfer }),
      (cb) => later.push(cb),
      50_000,
    );
    const flush = () => {
      while (later.length) later.shift()!();
    };
    return { handle, replies, later, flush };
  };

  it("renders a job in slices and hands its buffer over rather than copying it", () => {
    const { handle, replies, later, flush } = worker();
    const j = job(130.8128, 3);
    handle({ type: "render", id: 7, job: j });
    expect(replies).toHaveLength(0);
    expect(later).toHaveLength(1);
    flush();
    expect(replies).toHaveLength(1);
    const { reply, transfer } = replies[0];
    expect(reply.id).toBe(7);
    expect(reply.samples).toEqual(renderPluck(j.hz, SR, j.voice, 3));
    expect(transfer).toEqual([reply.samples!.buffer]);
  });

  it("stops a job between slices on cancel, replying with its id alone", () => {
    const { handle, replies, later, flush } = worker();
    handle({ type: "render", id: 1, job: job(130.8128) });
    later.shift()!(); // one slice
    handle({ type: "cancel", id: 1 });
    flush();
    expect(replies.map((r) => r.reply)).toEqual([{ id: 1 }]);
  });

  it("queues a job sent while another runs", () => {
    const { handle, replies, flush } = worker();
    handle({ type: "render", id: 1, job: job(130.8128) });
    handle({ type: "render", id: 2, job: job(196.0) });
    flush();
    expect(replies.map((r) => r.reply.id)).toEqual([1, 2]);
    expect(replies.every((r) => r.reply.samples)).toBe(true);
  });
});

/**
 * A worker running the real worker core in this thread, with messages
 * delivered as tasks, as a browser would.
 */
function inProcessWorker(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => setTimeout(() => handle(m)),
  };
  const handle = pluckWorker(
    (reply) => setTimeout(() => w.onmessage?.({ data: reply })),
    (cb) => setTimeout(cb),
  );
  return w;
}
