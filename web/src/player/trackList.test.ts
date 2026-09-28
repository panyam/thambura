import { describe, expect, it } from "vitest";
import { Tracks } from "./pageContext";
import { FakeAudio } from "./testFakes";
import { TrackList, UNDO_MS, type CatalogEntry, type Placed } from "./trackList";

// As the home page's spec offers them: the thambura added (#157), the kits
// only offered.
const CATALOG: CatalogEntry[] = [
  { kind: "hands", config: { fixturesUrl: "/f.json" } },
  { kind: "thambura", config: {}, added: true },
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

function setUp(opts: { store?: Mem | null; opened?: Record<string, string>; records?: Record<string, unknown>; catalog?: CatalogEntry[] } = {}) {
  const log: string[] = [];
  const records = new Map<string, unknown>(Object.entries(opts.records ?? {}));
  const timers: (() => void)[] = [];
  const audio = new FakeAudio();
  const tracks = new Tracks<Placed>();
  const opened = opts.opened ?? {};
  const removedParts: string[] = [];
  const store = opts.store === null ? undefined : (opts.store ?? new Mem());
  const list = new TrackList<Placed>({
    catalog: opts.catalog ?? CATALOG,
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
  it("starts a new listener with the claps and a thambura, and a drum when they add one", () => {
    const { list, tracks, store } = setUp();
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1"]);
    expect(list.state.addable).toEqual([
      { kind: "thambura" },
      { kind: "kit", kit: 0 },
      { kind: "kit", kit: 1 },
    ]);
    expect(list.state.rows.map((r) => r.removable)).toEqual([false, true]);
    // Not saved until they change it, so a later default still reaches them.
    expect(store?.value).toBeNull();
  });

  it("starts with the instruments the spec marks added, and offers the rest (#157)", () => {
    const withKit = CATALOG.map((e, i) => (i === 3 ? { ...e, added: true } : e));
    const { tracks, log, list } = setUp({ catalog: withKit });
    // The second kit in the spec, numbered kit-1 since it's the first on the page.
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1", "kit-1"]);
    expect(log).toContain("make kit-1:1 null");
    expect(list.state.addable).toEqual([{ kind: "thambura" }, { kind: "kit", kit: 0 }]);
  });

  it("starts without a thambura when the spec doesn't mark it added, and always with the claps", () => {
    const noThambura = CATALOG.map((e) => ({ ...e, added: undefined }));
    const { tracks, list } = setUp({ catalog: noThambura });
    expect(tracks.ids()).toEqual(["hands-1"]);
    expect(list.state.addable.map((a) => a.kind)).toEqual(["thambura", "kit", "kit"]);
  });

  it("starts with a saved list or a shared link over what the spec marks added", () => {
    const withKit = CATALOG.map((e, i) => (i === 2 ? { ...e, added: true } : e));
    const saved = setUp({ catalog: withKit, store: new Mem({ tracks: [{ id: "hands-1", kind: "hands" }] }) });
    expect(saved.tracks.ids()).toEqual(["hands-1"]);
    const linked = setUp({ catalog: withKit, opened: { "thambura-1": "t" } });
    expect(linked.tracks.ids()).toEqual(["hands-1", "thambura-1"]);
  });

  it("starts a page without the list with the first kit too, since it can't add one", () => {
    const { tracks } = setUp({ store: null });
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1", "kit-1"]);
  });

  it("starts with what a shared link had, with the claps always", () => {
    const { tracks, list } = setUp({ opened: { "kit-1": "kit1", "session-1": "x" } });
    expect(tracks.ids()).toEqual(["hands-1", "kit-1"]);
    // In the page's order, not the order the link's parts were written in.
    expect(setUp({ opened: { "kit-2": "kit0", "thambura-1": "t", "hands-1": "h", "kit-1": "kit1" } }).tracks.ids()).toEqual([
      "hands-1",
      "thambura-1",
      "kit-1",
      "kit-2",
    ]);
    expect(list.state.rows.find((r) => r.id === "kit-1")?.kit).toBe(1);
    expect(list.state.addable).toEqual([{ kind: "thambura" }, { kind: "kit", kit: 0 }]);
  });

  it("remembers what's on the page and what's muted, where the page shows a list", () => {
    const first = setUp();
    first.list.add({ kind: "kit", kit: 0 });
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
    list.add({ kind: "kit", kit: 0 });
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
    a.list.add({ kind: "kit", kit: 0 });
    a.list.remove("thambura-1");
    a.timers[0]();
    expect(a.list.state.removed).toBeNull();
    a.list.undoRemove();
    expect(a.tracks.ids()).toEqual(["hands-1", "kit-1"]);
    a.list.add({ kind: "thambura" });
    expect(a.log.at(-1)).toBe("make thambura-1 null");

    const b = setUp({ records: { "kit-1": { variety: "lots" } } });
    b.list.add({ kind: "kit", kit: 0 });
    b.list.remove("kit-1");
    b.list.add({ kind: "kit", kit: 0 });
    expect(b.list.state.removed).toBeNull();
    expect(b.log.at(-1)).toBe("make kit-1:0 null");
    expect(UNDO_MS).toBeGreaterThanOrEqual(3000);
  });

  it("won't remove the claps, add a third thambura, or add a kit twice", () => {
    const { list, tracks } = setUp();
    list.add({ kind: "kit", kit: 0 });
    list.remove("hands-1");
    list.add({ kind: "thambura" });
    list.add({ kind: "thambura" });
    list.add({ kind: "kit", kit: 0 });
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1", "kit-1", "thambura-2"]);
  });

  it("offers a second thambura, as iTanpura plays two, and no third", () => {
    const { list, tracks } = setUp();
    expect(list.state.addable).toEqual([{ kind: "thambura" }, { kind: "kit", kit: 0 }, { kind: "kit", kit: 1 }]);
    list.add({ kind: "thambura" });
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1", "thambura-2"]);
    expect(list.state.addable.some((a) => a.kind === "thambura")).toBe(false);
    // Taking the first off leaves the second, and adding one back fills the first's place.
    list.remove("thambura-1");
    list.add({ kind: "thambura" });
    expect(tracks.ids()).toEqual(["hands-1", "thambura-2", "thambura-1"]);
  });

  it("starts with both thamburas a shared link had", () => {
    const { tracks } = setUp({ opened: { "thambura-1": "t", "thambura-2": "t2" } });
    expect(tracks.ids()).toEqual(["hands-1", "thambura-1", "thambura-2"]);
  });

  it("numbers a new kit with the lowest free id", () => {
    const { list, tracks } = setUp();
    list.add({ kind: "kit", kit: 0 });
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
