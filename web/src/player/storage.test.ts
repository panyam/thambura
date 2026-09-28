import { describe, expect, it } from "vitest";
import { embedStorage, instrumentKey, memoryStorage, namedStorage, pageStorage, storageKey, withFallback, type Store } from "./storage";

describe("storageKey", () => {
  // Renaming one loses every returning listener's setup, so it has to be on purpose.
  it("keeps today's keys", () => {
    expect(storageKey("player")).toBe("thambura.player");
    expect(storageKey("drone")).toBe("thambura.drone");
    expect(storageKey("presets")).toBe("thambura.presets");
    expect(storageKey("shruthi")).toBe("thambura.shruthi");
    expect(storageKey("tracks")).toBe("thambura.tracks");
  });

  it("keeps each instrument under its own id", () => {
    expect(instrumentKey("thambura-1")).toBe("thambura.thambura-1");
    expect(instrumentKey("kit-1")).toBe("thambura.kit-1");
    expect(instrumentKey("hands-1")).toBe("thambura.hands-1");
  });
});

class MemoryStore implements Store {
  saves = 0;
  constructor(public value: unknown = null) {}
  load() {
    return this.value;
  }
  save(v: unknown) {
    this.value = v;
    this.saves++;
  }
}

describe("withFallback", () => {
  it("reads the old record while its own is empty, and writes only its own", () => {
    const own = new MemoryStore(null);
    const old = new MemoryStore({ settings: { key: 7 } });
    const store = withFallback(own, old);
    expect(store.load()).toEqual({ settings: { key: 7 } });
    store.save({ settings: { key: 3 } });
    expect(own.value).toEqual({ settings: { key: 3 } });
    expect(old.value).toEqual({ settings: { key: 7 } });
    expect(store.load()).toEqual({ settings: { key: 3 } });
  });

  it("never reads the old record once it has its own", () => {
    const store = withFallback(new MemoryStore({ settings: { key: 1 } }), new MemoryStore({ settings: { key: 7 } }));
    expect(store.load()).toEqual({ settings: { key: 1 } });
  });

  it("carries on when the old record can't be read", () => {
    const broken: Store = {
      load: () => {
        throw new Error("blocked");
      },
      save: () => {},
    };
    expect(withFallback(new MemoryStore(null), broken).load()).toBeNull();
  });
});

/** A stand-in localStorage, since vitest runs without a DOM. */
function fakeLocalStorage(): Map<string, string> {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
  return m;
}

describe("storage scopes (#144)", () => {
  it("keeps our own pages on today's keys", () => {
    const m = fakeLocalStorage();
    const s = pageStorage();
    s.store("shruthi").save({ key: 3 });
    s.instrument("thambura-1").save({ v: 1 });
    s.store("lab").save(true);
    expect([...m.keys()].sort()).toEqual(["thambura.lab.descriptions", "thambura.shruthi", "thambura.thambura-1"]);
    s.clear("thambura-1");
    expect(m.has("thambura.thambura-1")).toBe(false);
  });

  it("puts a named space under its own prefix, apart from another", () => {
    const m = fakeLocalStorage();
    namedStorage("kriti").store("shruthi").save({ key: 3 });
    namedStorage("kriti").instrument("thambura-1").save({ v: 1 });
    namedStorage("drill").store("shruthi").save({ key: 7 });
    expect([...m.keys()].sort()).toEqual(["thambura.drill.shruthi", "thambura.kriti.shruthi", "thambura.kriti.thambura-1"]);
    expect(namedStorage("kriti").store("shruthi").load()).toEqual({ key: 3 });
    expect(pageStorage().store("shruthi").load()).toBeNull();
  });

  it("keeps a memory space off localStorage altogether, for the visit only", () => {
    const m = fakeLocalStorage();
    const s = memoryStorage();
    s.store("shruthi").save({ key: 3 });
    s.instrument("kit-1").save({ v: 2 });
    expect(s.store("shruthi").load()).toEqual({ key: 3 });
    expect(s.instrument("kit-1").load()).toEqual({ v: 2 });
    s.clear("kit-1");
    expect(s.instrument("kit-1").load()).toBeNull();
    expect(m.size).toBe(0);
    // Two memory spaces are two embeds, and share nothing.
    expect(memoryStorage().store("shruthi").load()).toBeNull();
  });

  it("gives an embed a memory space unless its host names one", () => {
    const m = fakeLocalStorage();
    embedStorage(undefined).store("presets").save([]);
    expect(m.size).toBe(0);
    embedStorage("kriti").store("presets").save([]);
    expect([...m.keys()]).toEqual(["thambura.kriti.presets"]);
  });

  it("rejects a space name that could reach into another's keys", () => {
    for (const bad of ["", "a.b", "A", "has space", "x".repeat(41)]) expect(() => namedStorage(bad), bad).toThrow();
  });
});
