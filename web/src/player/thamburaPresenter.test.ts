import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_THAMBURA, KEY_G3, srutiFrequencies, type ThamburaSettings } from "../engine/shruthi";
import { FakeAudio, FakeFrames, FakeTicker } from "./testFakes";
import { ThamburaPresenter, type ThamburaState } from "./thamburaPresenter";

class FakeStore {
  saved: unknown = undefined;
  constructor(public initial: unknown = undefined) {}
  load() {
    return this.initial;
  }
  save(v: unknown) {
    this.saved = v;
  }
}

describe("ThamburaPresenter", () => {
  let audio: FakeAudio;
  let ticker: FakeTicker;
  let frames: FakeFrames;
  let store: FakeStore;
  let deferred: (() => void)[];
  let p: ThamburaPresenter;
  let views: ThamburaState[];

  const make = (saved?: unknown) => {
    store = new FakeStore(saved);
    p = new ThamburaPresenter({
      audio,
      ticker,
      frames,
      store,
      defer: (cb) => deferred.push(cb),
      rng: () => 0,
    });
    views = [];
    p.attach({ setState: (s) => views.push(s) });
  };
  const flushDeferred = () => {
    const q = deferred;
    deferred = [];
    q.forEach((cb) => cb());
  };
  // Advance the audio clock, firing the transport tick and a frame.
  const advance = (to: number) => {
    audio.now = to;
    ticker.onTick?.();
    frames.flush();
  };
  const run = (to: number, step = 0.025) => {
    for (let t = audio.now; t <= to + 1e-9; t += step) advance(t);
  };
  const set = (patch: Partial<ThamburaSettings>) => p.set(patch);

  beforeEach(() => {
    audio = new FakeAudio();
    ticker = new FakeTicker();
    frames = new FakeFrames();
    deferred = [];
    make();
  });

  it("starts from the defaults, closed, on the studio view", () => {
    expect(p.state.settings).toEqual(DEFAULT_THAMBURA);
    expect(p.state.playing).toBe(false);
    expect(p.state.open).toBe(false);
    expect(p.state.view).toBe("studio");
    expect(audio.busVolume.drone).toBe(DEFAULT_THAMBURA.volume);
    expect(audio.samples.size).toBe(0); // nothing rendered until it plays
  });

  it("restores saved settings, view and open state, cleaning bad values", () => {
    make({ settings: { key: KEY_G3, cents: 400, voice: "ladies" }, view: "raagini", open: true });
    expect(p.state.settings.key).toBe(KEY_G3);
    expect(p.state.settings.cents).toBe(50);
    expect(p.state.settings.voice).toBe("ladies");
    expect(p.state.view).toBe("raagini");
    expect(p.state.open).toBe(true);
    make({ view: "hologram", open: "yes" });
    expect(p.state.view).toBe("studio");
    expect(p.state.open).toBe(false);
  });

  it("plucks first, Sa, Sa, low Sa on the drone bus", async () => {
    await p.toggle();
    expect(audio.unlocked).toBe(1);
    expect(p.state.playing).toBe(true);
    expect(audio.samples.size).toBe(3); // Pa, Sa (shared by two strings), low Sa
    run(4.5);
    const plucks = audio.played.slice(0, 4);
    expect(plucks.every((e) => e.bus === "drone")).toBe(true);
    const [first, sa1, sa2, low] = plucks.map((e) => e.url);
    expect(new Set([first, sa1, low]).size).toBe(3);
    expect(sa2).toBe(sa1);
    expect([...audio.samples.keys()].sort()).toEqual([first, sa1, low].sort());
    // A 4.5 s cycle is five 0.9 s slots.
    expect(plucks[1].when - plucks[0].when).toBeCloseTo(0.9, 9);
    expect(audio.played[4].when - plucks[0].when).toBeCloseTo(4.5, 9);
  });

  it("fine-tunes by detune, clamped to ±50 cents, without re-rendering", async () => {
    await p.toggle();
    const rendered = [...audio.samples.keys()];
    for (let i = 0; i < 60; i++) p.nudgeCents(1);
    expect(p.state.settings.cents).toBe(50);
    flushDeferred();
    expect([...audio.samples.keys()]).toEqual(rendered);
    const n = audio.played.length;
    run(2);
    expect(audio.played.length).toBeGreaterThan(n);
    expect(audio.played.slice(n).every((e) => e.opts?.detune === 50)).toBe(true);
    for (let i = 0; i < 200; i++) p.nudgeCents(-1);
    expect(p.state.settings.cents).toBe(-50);
  });

  it("re-renders off the tick when the key changes, and drops the old samples", async () => {
    await p.toggle();
    const before = new Set(audio.samples.keys());
    set({ key: KEY_G3 });
    expect(new Set(audio.samples.keys())).toEqual(before); // not yet: deferred
    flushDeferred();
    const after = [...audio.samples.keys()];
    expect(after.some((k) => before.has(k))).toBe(false);
    expect(audio.dropped.sort()).toEqual([...before].sort());
    const n = audio.played.length;
    run(2);
    expect(audio.played.length).toBeGreaterThan(n);
    expect(audio.played.slice(n).every((e) => after.includes(e.url))).toBe(true);
  });

  it("coalesces several changes into one render", async () => {
    await p.toggle();
    set({ key: 5 });
    set({ key: 6 });
    set({ tone: 80 });
    expect(deferred).toHaveLength(1);
  });

  it("changes speed from the next pluck", async () => {
    await p.toggle();
    run(0.1);
    set({ cycleSeconds: 2.5 });
    run(1);
    expect(audio.played[1].when - audio.played[0].when).toBeCloseTo(0.5, 9);
  });

  it("stops scheduling and cancels unheard plucks on stop, keeping the bar open", async () => {
    p.setOpen(true);
    await p.toggle();
    run(1);
    const n = audio.played.length;
    p.toggle();
    expect(p.state.playing).toBe(false);
    expect(p.state.open).toBe(true);
    expect(audio.cancelled).toEqual(["drone"]);
    expect(ticker.onTick).toBeNull();
    expect(audio.played).toHaveLength(n);
  });

  it("lights each string as its pluck is heard, then lets it go dark", async () => {
    audio.latency = 0.1;
    await p.toggle();
    advance(0.02);
    expect(p.state.lit).toEqual([false, false, false, false]);
    const firstAt = audio.played[0].when;
    advance(firstAt + 0.1 + 0.01);
    expect(p.state.lit).toEqual([true, false, false, false]);
    advance(firstAt + 0.1 + 0.5);
    expect(p.state.lit[0]).toBe(false);
  });

  it("plays the sruti drone as three tones that follow the settings", async () => {
    set({ mode: "sruti" });
    await p.toggle();
    expect(ticker.onTick).toBeNull();
    const s = p.state.settings;
    expect(audio.tones.map((t) => t.spec.frequency)).toEqual(srutiFrequencies(s));
    expect(audio.tones.every((t) => t.bus === "drone")).toBe(true);
    p.nudgeCents(-3);
    expect(audio.tones.every((t) => t.spec.detune === -3)).toBe(true);
    set({ key: KEY_G3, firstString: "Ma1" });
    expect(audio.tones.map((t) => t.spec.frequency)).toEqual(srutiFrequencies(p.state.settings));
    p.toggle();
    expect(audio.tones.every((t) => t.stopped)).toBe(true);
  });

  it("switches between tambura and sruti while playing", async () => {
    await p.toggle();
    set({ mode: "sruti" });
    expect(ticker.onTick).toBeNull();
    expect(audio.cancelled).toEqual(["drone"]);
    expect(audio.tones).toHaveLength(3);
    set({ mode: "tambura" });
    expect(audio.tones.every((t) => t.stopped)).toBe(true);
    expect(ticker.onTick).not.toBeNull();
    expect(p.state.playing).toBe(true);
  });

  it("sends volume to the drone bus only", () => {
    set({ volume: 30 });
    expect(audio.busVolume.drone).toBe(30);
    expect(audio.busVolume.tala).toBeUndefined();
  });

  it("steps the first string like a Raagini's Select", () => {
    p.cycleFirstString();
    expect(p.state.settings.firstString).toBe("Ma1");
    set({ firstString: "Ri2" });
    p.cycleFirstString();
    expect(p.state.settings.firstString).toBe("Pa");
  });

  it("saves settings, view and open state", () => {
    set({ key: 7 });
    p.setView("mini");
    p.toggleOpen();
    expect(store.saved).toEqual({ settings: { ...DEFAULT_THAMBURA, key: 7 }, view: "mini", open: true });
    expect(views.at(-1)?.view).toBe("mini");
  });

  it("keeps playing when the bar is hidden", async () => {
    p.setOpen(true);
    await p.toggle();
    p.toggleOpen();
    expect(p.state.open).toBe(false);
    expect(p.state.playing).toBe(true);
    expect(ticker.onTick).not.toBeNull();
  });
});
