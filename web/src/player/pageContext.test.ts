import { describe, expect, it } from "vitest";
import { DEFAULT_THAMBURA, KEY_C3, KEY_G3, KEYS, tunedTonicHz, type Pitch } from "../engine/shruthi";
import { createClock, Shruthi, Tracks } from "./pageContext";
import { FakeAudio, FakeTicker } from "./testFakes";

describe("Shruthi", () => {
  class MemStore {
    saved: unknown[] = [];
    load() {
      return null;
    }
    save(v: unknown) {
      this.saved.push(v);
    }
  }

  it("tells followers the Sa now and on every change, and saves only changes", () => {
    const store = new MemStore();
    const s = new Shruthi({ key: KEY_C3, cents: 0, a4: 440 }, store);
    expect(s.hz).toBe(tunedTonicHz(DEFAULT_THAMBURA));
    const heard: Pitch[] = [];
    s.follow((p) => heard.push(p));
    s.set({ key: KEY_G3 });
    s.set({ key: KEY_G3 });
    s.nudgeCents(5);
    expect(heard.map((p) => [p.key, p.cents])).toEqual([
      [KEY_C3, 0],
      [KEY_G3, 0],
      [KEY_G3, 5],
    ]);
    expect(store.saved).toEqual([
      { key: KEY_G3, cents: 0, a4: 440 },
      { key: KEY_G3, cents: 5, a4: 440 },
    ]);
    expect(s.hz).toBeCloseTo(tunedTonicHz({ key: KEY_G3, cents: 5, a4: 440 }), 9);
  });

  it("stops at the ends of the keys and the fine tune, and clamps a bad value", () => {
    const s = new Shruthi({ key: 0, cents: -50, a4: 440 });
    s.stepKey(-1);
    s.nudgeCents(-1);
    expect(s.pitch).toEqual({ key: 0, cents: -50, a4: 440 });
    s.set({ key: KEYS.length + 3, cents: 99 });
    expect(s.pitch).toEqual({ key: KEYS.length - 1, cents: 50, a4: 440 });
    s.stepKey(1);
    expect(s.pitch.key).toBe(KEYS.length - 1);
  });
});

describe("Tracks", () => {
  it("holds the instruments playing, by id, in the order they were added", () => {
    const tracks = new Tracks<{ name: string }>();
    const kit = { name: "mridangam" };
    tracks.add("kit", kit);
    tracks.add("ghatam", { name: "ghatam" });
    expect(tracks.get("kit")).toBe(kit);
    expect(tracks.get("tabla")).toBeUndefined();
    expect(tracks.list().map((t) => t.name)).toEqual(["mridangam", "ghatam"]);
    expect(() => tracks.add("kit", kit)).toThrow(/kit/);
  });
});

describe("createClock", () => {
  it("is one transport on one tempo map", () => {
    const ticker = new FakeTicker();
    const clock = createClock(new FakeAudio(), ticker, 90);
    expect(clock.tempo.bpm).toBe(90);
    clock.transport.start();
    expect(ticker.onTick).not.toBeNull();
    clock.transport.stop();
  });
});
