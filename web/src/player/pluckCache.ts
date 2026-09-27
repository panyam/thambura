import { RENDER_VERSION } from "../engine/tambura";
import type { PluckJob, PluckRenderer } from "./pluckRenderer";

/**
 * Where a pluck is kept between visits: everything that changes its samples.
 * The presenter's own sample keys round the voice to three decimals, which
 * is fine within a page, but here two plans a rounding apart must not share
 * a pluck, so every value is exact. The engine version comes first, so a
 * bump misses every old entry.
 */
export function pluckKey(job: PluckJob): string {
  const voice = job.voice as unknown as Record<string, number>;
  const fields = Object.keys(voice)
    .sort()
    .map((f) => `${f}=${voice[f]}`)
    .join(",");
  return `v${RENDER_VERSION}/${job.sampleRate}/${job.seed}/${job.hz}/${fields}`;
}

/** Rendered plucks kept between visits. Never rejects: a failure is a miss, or a write that didn't happen. */
export interface PluckStore {
  get(key: string): Promise<Float32Array | undefined>;
  put(key: string, samples: Float32Array): Promise<void>;
}

/** One kept pluck's bookkeeping, apart from its samples so eviction never reads them. */
export interface PluckEntry {
  key: string;
  bytes: number;
  usedAt: number;
}

/** The storage under `LruPluckStore`: IndexedDB on the page, memory in tests. Any call may throw. */
export interface PluckBackend {
  entries(): Promise<PluckEntry[]>;
  read(key: string): Promise<Float32Array | undefined>;
  write(entry: PluckEntry, samples: Float32Array): Promise<void>;
  touch(key: string, usedAt: number): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** How much the pluck cache may keep: about 11 settings of three 9 s plucks at 48 kHz. */
export const PLUCK_CACHE_BYTES = 60 * 1024 * 1024;

/**
 * Keeps plucks up to `capBytes`, dropping the least recently used (a hit
 * counts as a use) to fit a new one. The first call drops entries from other
 * engine versions, which nothing will ask for again. Every backend failure
 * is swallowed, so a blocked or full store is an empty cache.
 */
export class LruPluckStore implements PluckStore {
  private opened: Promise<void> | null = null;
  private last = 0;
  // Writes run one at a time: a setting's three plucks arrive together, and
  // each works out what to evict from what the one before it left. Another
  // tab's writes can still overshoot the cap for a moment, until the next.
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly backend: PluckBackend,
    private readonly capBytes = PLUCK_CACHE_BYTES,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string): Promise<Float32Array | undefined> {
    try {
      await this.open();
      const samples = await this.backend.read(key);
      if (samples) await this.backend.touch(key, this.stamp());
      return samples;
    } catch {
      return undefined;
    }
  }

  put(key: string, samples: Float32Array): Promise<void> {
    this.writes = this.writes.then(() => this.write(key, samples));
    return this.writes;
  }

  private async write(key: string, samples: Float32Array): Promise<void> {
    try {
      await this.open();
      const bytes = samples.byteLength;
      if (bytes > this.capBytes) return;
      // Listed afresh on each write, since another tab may have written too.
      const others = (await this.backend.entries()).filter((e) => e.key !== key).sort((a, b) => a.usedAt - b.usedAt);
      let total = others.reduce((n, e) => n + e.bytes, bytes);
      const evict: string[] = [];
      for (const e of others) {
        if (total <= this.capBytes) break;
        evict.push(e.key);
        total -= e.bytes;
      }
      if (evict.length) await this.backend.remove(evict);
      await this.backend.write({ key, bytes, usedAt: this.stamp() }, samples);
    } catch {
      // Not kept; it renders again next time.
    }
  }

  private open(): Promise<void> {
    this.opened ??= (async () => {
      const entries = await this.backend.entries();
      this.last = Math.max(0, ...entries.map((e) => e.usedAt));
      const stale = entries.filter((e) => !e.key.startsWith(`v${RENDER_VERSION}/`)).map((e) => e.key);
      if (stale.length) await this.backend.remove(stale);
    })();
    return this.opened;
  }

  // A use time that always moves forward, so two uses in one millisecond still order.
  private stamp(): number {
    this.last = Math.max(this.now(), this.last + 1);
    return this.last;
  }
}

// How long after a render its pluck is written, so the write never competes
// with the swap-over and the first plucks.
const WRITE_DELAY_MS = 1000;

/**
 * A renderer that looks each pluck up in `store` first and renders only the
 * misses, on `inner`, writing them back once they're playing. A cancel stops
 * the lookup from starting a render, or reaches the render once started.
 */
export class CachedRenderer implements PluckRenderer {
  constructor(
    private readonly inner: PluckRenderer,
    private readonly store: PluckStore,
    private readonly later: (cb: () => void) => void = (cb) => setTimeout(cb, WRITE_DELAY_MS),
  ) {}

  render(job: PluckJob, done: (samples: Float32Array) => void): () => void {
    const key = pluckKey(job);
    let cancelled = false;
    let cancelRender: (() => void) | null = null;
    const renderIt = () => {
      if (cancelled) return;
      cancelRender = this.inner.render(job, (samples) => {
        done(samples);
        this.later(() => void this.store.put(key, samples).catch(() => {}));
      });
    };
    this.store.get(key).then(
      (samples) => {
        if (cancelled) return;
        if (samples) done(samples);
        else renderIt();
      },
      renderIt,
    );
    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }
}

const DB_NAME = "thambura-plucks";

/**
 * The page's backend: an IndexedDB database with the bookkeeping in `meta`
 * and the samples in `samples`, so listing entries never loads 1.7 MB
 * buffers. It opens at once, so a Start doesn't wait for it; if IndexedDB
 * is missing or blocked, every call rejects and the store is an empty cache.
 */
export function idbBackend(name = DB_NAME): PluckBackend {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("meta", { keyPath: "key" });
      req.result.createObjectStore("samples");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
  db.catch(() => {}); // a failure surfaces on the first call instead
  const run = async <T>(mode: IDBTransactionMode, f: (meta: IDBObjectStore, samples: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    const tx = (await db).transaction(["meta", "samples"], mode);
    const req = f(tx.objectStore("meta"), tx.objectStore("samples"));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
    return req ? req.result : undefined;
  };
  return {
    entries: async () => (await run<PluckEntry[]>("readonly", (meta) => meta.getAll())) ?? [],
    read: (key) => run<Float32Array | undefined>("readonly", (_, samples) => samples.get(key)),
    write: async (entry, samples) => {
      await run("readwrite", (meta, s) => {
        meta.put(entry);
        s.put(samples, entry.key);
      });
    },
    touch: async (key, usedAt) => {
      await run("readwrite", (meta) => {
        const req = meta.get(key);
        req.onsuccess = () => {
          if (req.result) meta.put({ ...req.result, usedAt });
        };
      });
    },
    remove: async (keys) => {
      await run("readwrite", (meta, samples) => {
        for (const k of keys) {
          meta.delete(k);
          samples.delete(k);
        }
      });
    },
  };
}

/** The page's pluck cache, or an empty one where there's no IndexedDB. */
export function pluckStore(): PluckStore {
  try {
    if (typeof indexedDB !== "undefined") return new LruPluckStore(idbBackend());
  } catch {
    // Some browsers throw on touching indexedDB with storage blocked.
  }
  return { get: async () => undefined, put: async () => {} };
}
