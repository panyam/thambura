import { describe, expect, it } from "vitest";
import { DEFAULT_THAMBURA } from "../engine/shruthi";
import { pluckVoice, RENDER_VERSION } from "../engine/tambura";
import { CachedRenderer, LruPluckStore, pluckKey, type PluckBackend, type PluckEntry, type PluckStore } from "./pluckCache";
import type { PluckJob, PluckRenderer } from "./pluckRenderer";

const voice = pluckVoice(DEFAULT_THAMBURA);
const job = (patch: Partial<PluckJob> = {}): PluckJob => ({ hz: 130.8128, sampleRate: 48000, voice, seed: 1, ...patch });
const samples = (n: number, fill = 0.5) => new Float32Array(n).fill(fill);
const MB = 1024 * 1024;

/** A backend in memory, counting its calls; `broken` makes every call throw. */
class MemoryBackend implements PluckBackend {
  meta = new Map<string, PluckEntry>();
  data = new Map<string, Float32Array>();
  reads = 0;
  broken = false;
  private check() {
    if (this.broken) throw new Error("QuotaExceededError");
  }
  async entries() {
    this.check();
    return [...this.meta.values()].map((e) => ({ ...e }));
  }
  async read(key: string) {
    this.check();
    this.reads++;
    const d = this.data.get(key);
    return d && new Float32Array(d);
  }
  async write(entry: PluckEntry, s: Float32Array) {
    this.check();
    this.meta.set(entry.key, { ...entry });
    this.data.set(entry.key, new Float32Array(s));
  }
  async touch(key: string, usedAt: number) {
    this.check();
    const e = this.meta.get(key);
    if (e) e.usedAt = usedAt;
  }
  async remove(keys: string[]) {
    this.check();
    for (const k of keys) {
      this.meta.delete(k);
      this.data.delete(k);
    }
  }
  get bytes() {
    return [...this.meta.values()].reduce((n, e) => n + e.bytes, 0);
  }
}

describe("pluckKey", () => {
  it("is the same for the same job", () => {
    expect(pluckKey(job())).toBe(pluckKey(job({ voice: { ...voice } })));
  });

  it("changes with everything that changes the samples", () => {
    const base = pluckKey(job());
    const changed = [
      job({ hz: 130.8129 }),
      job({ sampleRate: 44100 }),
      job({ seed: 2 }),
      ...Object.keys(voice).map((f) => job({ voice: { ...voice, [f]: (voice as unknown as Record<string, number>)[f] + 1e-9 } })),
    ].map(pluckKey);
    for (const k of changed) expect(k).not.toBe(base);
    expect(new Set(changed).size).toBe(changed.length);
  });

  it("starts with the engine version, so a bump misses every old entry", () => {
    expect(pluckKey(job()).startsWith(`v${RENDER_VERSION}/`)).toBe(true);
  });

  it("doesn't depend on the order of the voice's fields", () => {
    const reversed = Object.fromEntries(Object.entries(voice).reverse()) as typeof voice;
    expect(pluckKey(job({ voice: reversed }))).toBe(pluckKey(job()));
  });
});

describe("LruPluckStore", () => {
  const store = (backend: PluckBackend, cap = 10 * MB) => {
    let t = 1000;
    return new LruPluckStore(backend, cap, () => t++);
  };
  const key = (i: number) => `v${RENDER_VERSION}/k${i}`;

  it("gives back what it stored, bit for bit, and nothing for what it didn't", async () => {
    const s = store(new MemoryBackend());
    const x = new Float32Array([0.1, -0.2, 1 / 3, Math.PI]);
    await s.put(key(1), x);
    expect(await s.get(key(1))).toEqual(x);
    expect(await s.get(key(2))).toBeUndefined();
  });

  it("evicts the least recently used first, a hit counting as a use", async () => {
    const b = new MemoryBackend();
    const s = store(b, 3 * MB);
    for (const i of [1, 2, 3]) await s.put(key(i), samples(MB / 4));
    await s.get(key(1)); // 1 is now newer than 2 and 3
    await s.put(key(4), samples(MB / 4));
    expect([...b.meta.keys()].sort()).toEqual([key(1), key(3), key(4)]);
  });

  it("stays under its cap through many settings", async () => {
    const b = new MemoryBackend();
    const s = store(b, 20 * MB);
    for (let i = 0; i < 40; i++) {
      await s.put(key(i), samples((1.7 * MB) / 4));
      expect(b.bytes).toBeLessThanOrEqual(20 * MB);
    }
    expect(b.meta.has(key(39))).toBe(true);
    expect(b.meta.has(key(0))).toBe(false);
  });

  it("stays under its cap when a setting's plucks are written at once", async () => {
    const b = new MemoryBackend();
    const s = store(b, 3 * MB);
    for (const i of [1, 2, 3]) await s.put(key(i), samples(MB / 4));
    await Promise.all([4, 5, 6].map((i) => s.put(key(i), samples(MB / 4))));
    expect(b.bytes).toBeLessThanOrEqual(3 * MB);
    expect([...b.meta.keys()].sort()).toEqual([key(4), key(5), key(6)]);
  });

  it("never keeps a pluck bigger than the whole cap", async () => {
    const b = new MemoryBackend();
    const s = store(b, MB);
    await s.put(key(1), samples(MB)); // 4 MB
    expect(b.meta.size).toBe(0);
  });

  it("drops entries from other engine versions when it opens", async () => {
    const b = new MemoryBackend();
    await b.write({ key: `v${RENDER_VERSION + 1}/old`, bytes: 8, usedAt: 1 }, samples(2));
    await b.write({ key: "v0/older", bytes: 8, usedAt: 1 }, samples(2));
    await b.write({ key: key(1), bytes: 8, usedAt: 1 }, samples(2));
    const s = store(b);
    expect(await s.get(key(1))).toBeDefined();
    expect([...b.meta.keys()]).toEqual([key(1)]);
  });

  it("works as an empty cache when the backend throws", async () => {
    const b = new MemoryBackend();
    b.broken = true;
    const s = store(b);
    await expect(s.put(key(1), samples(4))).resolves.toBeUndefined();
    await expect(s.get(key(1))).resolves.toBeUndefined();
  });
});

/** A store whose lookups resolve when the test says so. */
class HeldStore implements PluckStore {
  gets: { key: string; resolve: (s: Float32Array | undefined) => void }[] = [];
  puts: { key: string; samples: Float32Array }[] = [];
  get(key: string) {
    return new Promise<Float32Array | undefined>((resolve) => this.gets.push({ key, resolve }));
  }
  async put(key: string, s: Float32Array) {
    this.puts.push({ key, samples: s });
  }
}

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

describe("CachedRenderer", () => {
  const flush = () => new Promise((r) => setTimeout(r));
  const setup = () => {
    const inner = new HeldRenderer();
    const store = new HeldStore();
    const later: (() => void)[] = [];
    const r = new CachedRenderer(inner, store, (cb) => later.push(cb));
    return { inner, store, later, r };
  };

  it("plays a stored pluck without rendering it", async () => {
    const { inner, store, r } = setup();
    const got: Float32Array[] = [];
    r.render(job(), (s) => got.push(s));
    expect(store.gets.map((g) => g.key)).toEqual([pluckKey(job())]);
    const stored = samples(4, 0.25);
    store.gets[0].resolve(stored);
    await flush();
    expect(got).toEqual([stored]);
    expect(inner.jobs).toHaveLength(0);
  });

  it("renders a miss, and stores it only after it has been handed over", async () => {
    const { inner, store, later, r } = setup();
    const got: Float32Array[] = [];
    r.render(job(), (s) => got.push(s));
    store.gets[0].resolve(undefined);
    await flush();
    expect(inner.jobs).toHaveLength(1);
    const rendered = samples(4, 0.75);
    inner.jobs[0].done(rendered);
    expect(got).toEqual([rendered]);
    expect(store.puts).toHaveLength(0);
    later.forEach((cb) => cb());
    await flush();
    expect(store.puts).toEqual([{ key: pluckKey(job()), samples: rendered }]);
  });

  it("starts no render for a job cancelled while it was being looked up", async () => {
    const { inner, store, r } = setup();
    const cancel = r.render(job(), () => {
      throw new Error("a cancelled job finished");
    });
    cancel();
    store.gets[0].resolve(undefined);
    await flush();
    expect(inner.jobs).toHaveLength(0);
  });

  it("passes a cancel on to the render once it has started", async () => {
    const { inner, store, r } = setup();
    const cancel = r.render(job(), () => {});
    store.gets[0].resolve(undefined);
    await flush();
    cancel();
    expect(inner.jobs[0].cancelled).toBe(true);
  });

  it("renders when the store's lookup fails", async () => {
    const inner = new HeldRenderer();
    const failing: PluckStore = { get: () => Promise.reject(new Error("blocked")), put: () => Promise.reject(new Error("blocked")) };
    const r = new CachedRenderer(inner, failing, (cb) => cb());
    const got: Float32Array[] = [];
    r.render(job(), (s) => got.push(s));
    await flush();
    expect(inner.jobs).toHaveLength(1);
    inner.jobs[0].done(samples(2));
    await flush();
    expect(got).toHaveLength(1);
  });
});
