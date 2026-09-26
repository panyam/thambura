import { beforeEach, describe, expect, it } from "vitest";
import { HandsPresenter } from "./handsPresenter";
import { createClock, type Clock } from "./pageContext";
import { FakeAudio, FakeTicker } from "./testFakes";

const FIXTURES = {
  SoundGroups: {
    Clap: { down: "/clap-hi.wav", open: "/clap-lo.wav" },
    Metronome: { down: "/tick-hi.wav", open: "/tick-lo.wav" },
  },
  ImageGroups: { Simple: { down: "/down.gif" } },
};

class MemoryStore {
  constructor(public saved: unknown = null) {}
  load() {
    return this.saved;
  }
  save(v: unknown) {
    this.saved = v;
  }
}

describe("HandsPresenter", () => {
  let audio: FakeAudio;
  let clock: Clock;
  let store: MemoryStore;
  let h: HandsPresenter;

  const make = async (saved: unknown = null, legacy: unknown = null) => {
    store = new MemoryStore(saved);
    h = new HandsPresenter({
      audio,
      track: "hands-1",
      clock,
      fetchJson: async () => FIXTURES,
      store,
      legacyStore: new MemoryStore(legacy),
    });
    await h.load("/fixtures.json");
  };

  beforeEach(async () => {
    audio = new FakeAudio();
    clock = createClock(audio, new FakeTicker());
    await make();
  });

  it("loads the first sound group, preloads it, and sets its level", () => {
    expect(h.state.status).toBe("ready");
    expect(h.state.soundGroups).toEqual(["Clap", "Metronome"]);
    expect(h.state.soundGroup).toBe("Clap");
    expect(audio.loaded).toEqual(["/clap-hi.wav", "/clap-lo.wav"]);
    expect(audio.busVolume["hands-1"]).toBe(50);
  });

  it("plays each tick the tala calls, by its sound's name, on its own track", () => {
    clock.ticks.emit({ time: 1.25, sound: "down" });
    clock.ticks.emit({ time: 1.5, sound: "open" });
    clock.ticks.emit({ time: 1.75, sound: "guru_1" }); // the group has no such sound
    expect(audio.played).toEqual([
      { url: "/clap-hi.wav", bus: "hands-1", when: 1.25 },
      { url: "/clap-lo.wav", bus: "hands-1", when: 1.5 },
    ]);
  });

  it("switches sound group, and ignores one the fixture doesn't have", async () => {
    await h.setSoundGroup("Metronome");
    await h.setSoundGroup("Deleted");
    expect(h.state.soundGroup).toBe("Metronome");
    clock.ticks.emit({ time: 2, sound: "down" });
    expect(audio.played.at(-1)).toMatchObject({ url: "/tick-hi.wav", bus: "hands-1" });
  });

  it("takes back what it booked when the transport stops", () => {
    clock.transport.start(0);
    clock.transport.stop();
    expect(audio.cancelled).toEqual(["hands-1"]);
  });

  it("clamps the volume and saves each change", async () => {
    h.setVolume(-5);
    expect(h.state.volume).toBe(0);
    expect(audio.busVolume["hands-1"]).toBe(0);
    h.setVolume(30);
    await h.setSoundGroup("Metronome");
    expect(store.saved).toEqual({ soundGroup: "Metronome", volume: 30 });
  });

  it("restores its choices, and falls back for ones no longer valid", async () => {
    await make({ soundGroup: "Metronome", volume: 30 });
    expect(h.state).toMatchObject({ soundGroup: "Metronome", volume: 30 });
    expect(audio.busVolume["hands-1"]).toBe(30);
    await make({ soundGroup: "SaRiGaMa", volume: "loud" });
    expect(h.state).toMatchObject({ soundGroup: "Clap", volume: 50 });
  });

  it("takes Sounds and Volume from the tala's old record once", async () => {
    await make(null, { soundGroup: "Metronome", volume: 30, tempo: 72 });
    expect(h.state).toMatchObject({ soundGroup: "Metronome", volume: 30 });
    expect(store.saved).toEqual({ soundGroup: "Metronome", volume: 30 });
    // Its own record wins once it has one.
    await make({ soundGroup: "Clap", volume: 80 }, { soundGroup: "Metronome", volume: 30 });
    expect(h.state).toMatchObject({ soundGroup: "Clap", volume: 80 });
  });
});
