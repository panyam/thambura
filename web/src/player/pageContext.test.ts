import { describe, expect, it } from "vitest";
import { DEFAULT_THAMBURA, tunedTonicHz } from "../engine/shruthi";
import { createClock, Tonic, Tracks } from "./pageContext";
import { FakeAudio, FakeTicker } from "./testFakes";

describe("Tonic", () => {
  it("starts on the default thambura's Sa and tells followers of every change", () => {
    const t = new Tonic();
    expect(t.hz).toBe(tunedTonicHz(DEFAULT_THAMBURA));
    const heard: number[] = [];
    t.follow((hz) => heard.push(hz));
    t.set(220);
    t.set(220);
    t.set(-1);
    t.set(Number.NaN);
    t.set(196);
    // A follower hears the current Sa at once, then each real change.
    expect(heard).toEqual([tunedTonicHz(DEFAULT_THAMBURA), 220, 196]);
    expect(t.hz).toBe(196);
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
