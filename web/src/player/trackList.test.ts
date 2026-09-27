import { describe, expect, it } from "vitest";
import { Tracks } from "./pageContext";
import { FakeAudio } from "./testFakes";
import { TrackList, UNDO_MS, type CatalogEntry, type Placed } from "./trackList";

const CATALOG: CatalogEntry[] = [
  { kind: "hands", config: { fixturesUrl: "/f.json" } },
  { kind: "thambura", config: {} },
  { kind: "kit", config: { url: "/Kits/mridangam/kit.json" } },
  { kind: "kit", config: { url: "/Kits/ghatam/kit.json" } },
];

class Mem {
  constructor(public value: unknown = null) {}
  load() {
    return this.value;
  }
  save(v: unknown) {
    this.value = v;
  }
}

function setUp(opts: { store?: Mem | null; opened?: Record<string, string>; records?: Record<string, unknown> } = {}) {
  const log: string[] = [];
  const records = new Map<string, unknown>(Object.entries(opts.records ?? {}));
  const timers: (() => void)[] = [];
  const audio = new FakeAudio();
  const tracks = new Tracks<Placed>();
  const opened = opts.opened ?? {};
  const removedParts: string[] = [];
  const store = opts.store === null ? undefined : (opts.store ?? new Mem());
  const list = new TrackList<Placed>({
    catalog: CATALOG,
    make: (p) => {
      log.push(`make ${p.id}${p.kind === "kit" ? `:${p.kit}` : ""} ${JSON.stringify(records.get(p.id) ?? null)}`);
      return { instrument: p, dispose: () => log.push(`dispose ${p.id}`) };
    },
    tracks,
    audio,
    link: { openedIds: () => Object.keys(opened), opened: (id) => opened[id] ?? null, remove: (id) => removedParts.push(id) },
    kitOf: (part) => (part.startsWith("kit") ? Number(part.slice(3)) : null),
    store,
    records: {
      load: (id) => records.get(id) ?? null,
      save: (id, v) => records.set(id, v),
      clear: (id) => records.delete(id),
    },
    defer: (cb) => {
      timers.push(cb);
      return () => timers.splice(timers.indexOf(cb), 1);
    },
  });
  return { list, log, tracks, audio, store, records, timers, removedParts };
}

describe("TrackList", () => {
  it("starts with one of each kind the page offers, and only the first kit", () => {
    const { list, tracks } = setUp();
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1", "kit-1"]);
    expect(list.state.addable).toEqual([{ kind: "kit", kit: 1 }]);
    expect(list.state.rows.map((r) => r.removable)).toEqual([false, true, true]);
  });

  it("starts with what a shared link had, with the claps always", () => {
    const { tracks, list } = setUp({ opened: { "kit-1": "kit1", "session-1": "x" } });
    expect(tracks.ids()).toEqual(["hands-1", "kit-1"]);
    expect(list.state.rows.find((r) => r.id === "kit-1")?.kit).toBe(1);
    expect(list.state.addable).toEqual([{ kind: "thambura" }, { kind: "kit", kit: 0 }]);
  });

  it("remembers what's on the page and what's muted, where the page shows a list", () => {
    const first = setUp();
    first.list.remove("thambura-1");
    first.list.add({ kind: "kit", kit: 1 });
    first.list.setMuted("kit-2", true);
    first.list.setSoloed("kit-1", true);
    const again = setUp({ store: first.store });
    expect(again.tracks.ids()).toEqual(["hands-1", "kit-1", "kit-2"]);
    expect(again.list.state.rows.map((r) => [r.id, r.muted, r.soloed])).toEqual([
      ["hands-1", false, false],
      ["kit-1", false, false],
      ["kit-2", true, false],
    ]);
    expect(again.audio.muted["kit-2"]).toBe(true);
  });

  it("ignores a saved list and a link's parts on a page without a list", () => {
    const { tracks } = setUp({ store: null, opened: { "kit-1": "kit1" } });
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1", "kit-1"]);
  });

  it("clears what a removed instrument saved, and Undo puts it back", () => {
    const { list, log, records, timers, tracks, removedParts } = setUp({ records: { "thambura-1": { settings: { key: 9 } } } });
    list.remove("thambura-1");
    expect(tracks.ids()).toEqual(["hands-1", "kit-1"]);
    expect(records.has("thambura-1")).toBe(false);
    expect(removedParts).toEqual(["thambura-1"]);
    expect(list.state.removed?.id).toBe("thambura-1");
    list.undoRemove();
    expect(list.state.removed).toBeNull();
    expect(timers).toHaveLength(0);
    expect(log.slice(-2)).toEqual(["dispose thambura-1", 'make thambura-1 {"settings":{"key":9}}']);
  });

  it("starts fresh once Undo has passed, or when added back by hand", () => {
    const a = setUp({ records: { "thambura-1": { settings: { key: 9 } } } });
    a.list.remove("thambura-1");
    a.timers[0]();
    expect(a.list.state.removed).toBeNull();
    a.list.undoRemove();
    expect(a.tracks.ids()).toEqual(["hands-1", "kit-1"]);
    a.list.add({ kind: "thambura" });
    expect(a.log.at(-1)).toBe("make thambura-1 null");

    const b = setUp({ records: { "kit-1": { variety: "lots" } } });
    b.list.remove("kit-1");
    b.list.add({ kind: "kit", kit: 0 });
    expect(b.list.state.removed).toBeNull();
    expect(b.log.at(-1)).toBe("make kit-1:0 null");
    expect(UNDO_MS).toBeGreaterThanOrEqual(3000);
  });

  it("won't remove the claps, add a second thambura, or add a kit twice", () => {
    const { list, tracks } = setUp();
    list.remove("hands-1");
    list.add({ kind: "thambura" });
    list.add({ kind: "kit", kit: 0 });
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1", "kit-1"]);
  });

  it("numbers a new kit with the lowest free id", () => {
    const { list, tracks } = setUp();
    list.add({ kind: "kit", kit: 1 });
    list.remove("kit-1");
    list.add({ kind: "kit", kit: 0 });
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1", "kit-2", "kit-1"]);
    expect(list.state.rows.map((r) => [r.id, r.kit])).toEqual([
      ["hands-1", undefined],
      ["thambura-1", undefined],
      ["kit-2", 1],
      ["kit-1", 0],
    ]);
  });

  it("mutes and solos through the mixer", () => {
    const { list, audio } = setUp();
    list.setMuted("hands-1", true);
    list.setSoloed("thambura-1", true);
    list.setSoloed("thambura-1", false);
    expect(audio.muted["hands-1"]).toBe(true);
    expect(audio.soloed["thambura-1"]).toBe(false);
    list.setMuted("nothing-1", true);
    expect(audio.muted["nothing-1"]).toBeUndefined();
  });
});
