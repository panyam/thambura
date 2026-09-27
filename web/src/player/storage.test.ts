import { describe, expect, it } from "vitest";
import { instrumentKey, storageKey, withFallback, type Store } from "./storage";

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
