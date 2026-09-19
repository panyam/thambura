import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_THAMBURA, KEY_G3, srutiFrequencies, type ThamburaSettings } from "../engine/shruthi";
import { decodeLink, encodeLink } from "../engine/shareLink";
import { planFor } from "../engine/thamburaPlan";
import { FakeAudio, FakeFrames, FakeTicker } from "./testFakes";
import { BEFORE_LINK_PRESET, ThamburaPresenter, type ThamburaState } from "./thamburaPresenter";

class FakeLink {
  writes: string[] = [];
  constructor(public initial: string | null = null) {}
  read() {
    return this.initial;
  }
  write(link: string) {
    this.writes.push(link);
  }
}

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
  let presetStore: FakeStore;
  let deferred: (() => void)[];
  let delays: number[];
  let p: ThamburaPresenter;
  let views: ThamburaState[];

  const make = (saved?: unknown, link?: FakeLink, presets?: unknown) => {
    store = new FakeStore(saved);
    presetStore = new FakeStore(presets);
    p = new ThamburaPresenter({
      audio,
      ticker,
      frames,
      store,
      presets: presetStore,
      link,
      defer: (cb, ms) => {
        deferred.push(cb);
        delays.push(ms);
      },
      rng: () => 0,
    });
    views = [];
    p.attach({ setState: (s) => views.push(s) });
  };
  // Runs deferred work, including anything it defers in turn; returns how many rounds ran.
  const flushDeferred = () => {
    let rounds = 0;
    while (deferred.length > 0) {
      const q = deferred;
      deferred = [];
      q.forEach((cb) => cb());
      rounds++;
    }
    return rounds;
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
  // Starts playing and lets the first renders finish, as the page would a moment later.
  const start = async () => {
    await p.toggle();
    flushDeferred();
  };

  beforeEach(() => {
    audio = new FakeAudio();
    ticker = new FakeTicker();
    frames = new FakeFrames();
    deferred = [];
    delays = [];
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
    set({ mode: "tambura" }); // the classic voice: even slots, strings ring on
    await start();
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
    await start();
    const rendered = [...audio.samples.keys()];
    for (let i = 0; i < 60; i++) p.nudgeCents(1);
    expect(p.state.settings.cents).toBe(50);
    flushDeferred();
    expect([...audio.samples.keys()]).toEqual(rendered);
    const n = audio.played.length;
    run(2);
    expect(audio.played.length).toBeGreaterThan(n);
    // The second Sa string sits 1.5 cents sharp of the others in tambura mode.
    const want = (e: (typeof audio.played)[number]) => (e.opts?.choke === "thambura/string2" ? 51.5 : 50);
    expect(audio.played.slice(n).every((e) => e.opts?.detune === want(e))).toBe(true);
    for (let i = 0; i < 200; i++) p.nudgeCents(-1);
    expect(p.state.settings.cents).toBe(-50);
  });

  it("re-renders off the tick when the key changes, and drops the old samples", async () => {
    await start();
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

  it("waits a moment after a change before rendering, but not at start or between slices", async () => {
    await start();
    expect(delays.length).toBeGreaterThan(1);
    expect(delays.every((ms) => ms === 0)).toBe(true);
    delays = [];
    set({ key: KEY_G3 });
    flushDeferred();
    expect(delays[0]).toBeGreaterThanOrEqual(50);
    expect(delays.slice(1).every((ms) => ms === 0)).toBe(true);
  });

  it("coalesces several changes into one render", async () => {
    await start();
    set({ key: 5 });
    set({ key: 6 });
    set({ tone: 80 });
    expect(deferred).toHaveLength(1);
  });

  it("renders one pluck per deferred call, keeping the old samples until all are ready", async () => {
    await start();
    const before = new Set(audio.samples.keys());
    set({ key: KEY_G3 });
    deferred.shift()!();
    expect(audio.samples.size).toBe(4); // three old, one new
    run(1.5);
    expect(audio.played.every((e) => before.has(e.url))).toBe(true);
    // Two more renders, then one call to switch over.
    expect(flushDeferred()).toBe(3);
    expect(audio.samples.size).toBe(3);
  });

  it("changes speed from the next pluck", async () => {
    set({ mode: "tambura" }); // the classic voice: even slots, strings ring on
    await start();
    run(0.1);
    set({ cycleSeconds: 2.5 });
    run(1);
    expect(audio.played[1].when - audio.played[0].when).toBeCloseTo(0.5, 9);
  });

  it("stops scheduling and cancels unheard plucks on stop, keeping the bar open", async () => {
    p.setOpen(true);
    await start();
    run(1);
    const n = audio.played.length;
    p.toggle();
    expect(p.state.playing).toBe(false);
    expect(p.state.open).toBe(true);
    expect(audio.cancelled).toEqual(["drone"]);
    expect(audio.released).toEqual([{ bus: "drone", seconds: 1.5 }]);
    expect(ticker.onTick).toBeNull();
    expect(audio.played).toHaveLength(n);
  });

  it("waits for its samples before the first pluck", async () => {
    await p.toggle();
    expect(p.state.playing).toBe(true);
    expect(ticker.onTick).toBeNull();
    expect(audio.played).toHaveLength(0);
    flushDeferred();
    expect(audio.samples.size).toBe(3);
    expect(ticker.onTick).not.toBeNull();
    expect(audio.played.length).toBeGreaterThan(0);
  });

  it("never starts plucking if stopped before the samples are ready", async () => {
    await p.toggle();
    p.toggle();
    flushDeferred();
    expect(ticker.onTick).toBeNull();
    expect(audio.played).toHaveLength(0);
  });

  it("starts at once when the samples are already rendered", async () => {
    await start();
    p.toggle();
    await p.toggle();
    expect(deferred).toHaveLength(0);
    expect(ticker.onTick).not.toBeNull();
  });

  it("cuts off each string's previous pluck when it is plucked again", async () => {
    await start();
    run(9.5);
    const groups = audio.played.map((e) => e.opts?.choke);
    expect(new Set(groups.slice(0, 4)).size).toBe(4);
    expect(groups.slice(4, 8)).toEqual(groups.slice(0, 4));
  });

  it("swaps between tambura and guitar without stopping, re-rendering the plucks", async () => {
    await start();
    const tambura = new Map(audio.samples);
    set({ mode: "guitar" });
    expect(ticker.onTick).not.toBeNull();
    expect(deferred).toHaveLength(1);
    flushDeferred();
    const guitar = [...audio.samples.entries()];
    expect(guitar.some(([k]) => tambura.has(k))).toBe(false);
    // The guitar pluck is the shorter render.
    expect(Math.max(...guitar.map(([, x]) => x.length))).toBeLessThan(Math.min(...[...tambura.values()].map((x) => x.length)));
    expect(p.state.playing).toBe(true);
  });

  it("doesn't re-render when switching to sruti and back", async () => {
    set({ mode: "tambura" }); // the classic voice: even slots, strings ring on
    await start();
    const keys = [...audio.samples.keys()];
    set({ mode: "sruti" });
    set({ mode: "tambura" });
    expect(deferred).toHaveLength(0);
    expect([...audio.samples.keys()]).toEqual(keys);
  });

  it("sets the second Sa string a shade sharp in tambura mode only", async () => {
    set({ mode: "tambura" }); // the classic voice: even slots, strings ring on
    set({ cents: 4 });
    await start();
    run(1.9);
    const detunes = audio.played.slice(0, 3).map((e) => e.opts?.detune);
    expect(detunes[0]).toBe(4);
    expect(detunes[1]).toBe(4);
    expect(detunes[2]).toBeCloseTo(5.5, 9);
    set({ mode: "guitar" });
    flushDeferred();
    const n = audio.played.length;
    run(6);
    expect(audio.played.slice(n).every((e) => e.opts?.detune === 4)).toBe(true);
  });

  it("sets the second Sa string a shade sharp in the jawari mode too", async () => {
    set({ mode: "jawari", cents: 4 });
    await start();
    run(3);
    expect(audio.played.slice(0, 3).map((e) => e.opts?.detune)).toEqual([4, 4, 5.5]);
  });

  it("damps each string before its next pluck in the jawari mode", async () => {
    set({ mode: "jawari" });
    await start();
    run(10);
    const groups = [0, 1, 2, 3].map((i) => `thambura/string${i}`);
    expect(audio.damped.slice(0, 4).map((d) => d.group)).toEqual(groups);
    // A damp is handed out up to a second before its string's next pluck.
    for (const d of audio.damped.filter((d) => d.when < 9)) {
      const plays = audio.played.filter((e) => e.opts?.choke === d.group).map((e) => e.when);
      // Between the string's last pluck and its next one.
      expect(plays.some((t) => t < d.when)).toBe(true);
      expect(plays.find((t) => t > d.when)).toBeDefined();
    }
  });

  it("lets strings ring into their next pluck in the classic mode", async () => {
    set({ mode: "tambura" }); // the classic voice: even slots, strings ring on
    await start();
    run(10);
    expect(audio.played.length).toBeGreaterThan(8);
    expect(audio.damped).toEqual([]);
  });

  it("switches to the played rhythm with the jawari mode", async () => {
    await start();
    run(5);
    set({ mode: "jawari" });
    flushDeferred();
    const n = audio.played.length;
    run(20);
    const gaps = audio.played
      .slice(n)
      .map((e) => e.when)
      .map((t, i, a) => (i > 0 ? t - a[i - 1] : 0))
      .slice(1, 5)
      .map((g) => Number((g / 4.5).toFixed(3)));
    expect([...gaps].sort()).toEqual([0.205, 0.205, 0.29, 0.3]);
  });

  it("lights each string as its pluck is heard, then lets it go dark", async () => {
    audio.latency = 0.1;
    await start();
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

  it("brings the first string's swara forward in the sruti drone", async () => {
    set({ mode: "sruti" });
    await p.toggle();
    const [first, sa, upper] = audio.tones.map((t) => t.spec);
    expect(first.gain).toBeGreaterThanOrEqual(sa.gain * 1.5);
    expect(upper.gain).toBeLessThan(sa.gain);
    // Placed apart, so the ear hears two notes rather than one blend.
    expect(first.pan).toBeLessThan(0);
    expect(sa.pan).toBeGreaterThan(0);
  });

  it("switches between tambura and sruti while playing", async () => {
    set({ mode: "tambura" }); // the classic voice: even slots, strings ring on
    await start();
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

  it("starts the custom plan from a mode, sounding the same and rendering nothing new", async () => {
    set({ mode: "jawari" });
    await start();
    run(12);
    const jawari = audio.played.slice(-4);
    const samples = [...audio.samples.keys()];
    p.loadCustom("jawari");
    expect(p.state.settings.mode).toBe("custom");
    expect(deferred).toHaveLength(0);
    expect([...audio.samples.keys()]).toEqual(samples);
    const n = audio.played.length;
    run(24);
    const custom = audio.played.slice(n).slice(0, 4);
    const strip = (e: (typeof custom)[number]) => ({ url: e.url, opts: e.opts });
    expect(custom.map(strip).sort((a, b) => a.url.localeCompare(b.url))).toEqual(
      jawari.map(strip).sort((a, b) => a.url.localeCompare(b.url)),
    );
  });

  it("re-renders only the string whose voice the Lab changed", async () => {
    p.loadCustom("jawari");
    await start();
    const before = [...audio.samples.keys()];
    const plan = p.state.custom;
    const strings = [...plan.strings] as typeof plan.strings;
    strings[2] = { ...strings[2], voice: { ...strings[2].voice, attack: 0.03 } };
    p.setCustom({ ...plan, strings });
    flushDeferred();
    const after = [...audio.samples.keys()];
    // The Sa strings shared one sample; the first Sa keeps it and the second gets its own.
    expect(before).toHaveLength(3);
    expect(after.filter((k) => !before.includes(k))).toHaveLength(1);
    expect(before.every((k) => after.includes(k))).toBe(true);
  });

  it("applies a custom level, pan and detune at the next pluck without re-rendering", async () => {
    p.loadCustom("jawari");
    await start();
    const plan = p.state.custom;
    const strings = plan.strings.map((s) => ({ ...s, level: 0.5, pan: 0.5, detune: 3 })) as typeof plan.strings;
    p.setCustom({ ...plan, strings });
    expect(deferred).toHaveLength(0);
    const n = audio.played.length;
    run(8);
    const e = audio.played[n];
    expect(e.opts).toMatchObject({ detune: 3, pan: 0.5 });
    expect(e.opts!.gain! / 0.5).toBeGreaterThan(0.84);
  });

  it("stops no string when the custom plan damps none", async () => {
    const plan = p.state.custom;
    p.setCustom({ ...plan, strings: plan.strings.map((s) => ({ ...s, damp: 0 })) as typeof plan.strings });
    await start();
    run(12);
    expect(audio.played.length).toBeGreaterThan(8);
    expect(audio.damped).toEqual([]);
  });

  it("remembers the custom plan, and falls back to the jawari's for a broken one", () => {
    p.loadCustom("guitar");
    const saved = store.saved as { custom: unknown };
    make(store.saved);
    expect(p.state.custom).toEqual(saved.custom);
    make({ custom: { strings: 42 } });
    expect(p.state.custom).toEqual(planFor({ ...DEFAULT_THAMBURA, mode: "jawari" }));
  });

  describe("share links", () => {
    const decode = (l: string) => decodeLink(l, { settings: DEFAULT_THAMBURA })!;

    it("shows the current setup in the address bar from the start, and after each change", () => {
      const link = new FakeLink();
      make(undefined, link);
      expect(decode(link.writes[0]).settings.key).toBe(DEFAULT_THAMBURA.key);
      set({ key: 7 });
      p.setView("lab");
      const last = decode(link.writes.at(-1)!);
      expect(last.settings.key).toBe(7);
      expect(last.view).toBe("lab");
    });

    it("plays a shared setup over the saved one, keeping the listener's volume", () => {
      const shared = encodeLink({
        settings: { ...DEFAULT_THAMBURA, key: 9, mode: "guitar", volume: 90 },
        custom: planFor({ ...DEFAULT_THAMBURA, mode: "jawari" }),
        view: "lab",
        open: true,
      });
      make({ settings: { ...DEFAULT_THAMBURA, key: 3, volume: 20 } }, new FakeLink(shared));
      expect(p.state.settings).toMatchObject({ key: 9, mode: "guitar", volume: 20 });
      expect(p.state).toMatchObject({ view: "lab", open: true, notice: "Opened a shared setup." });
      // The listener's own setup stays saved until they change something.
      expect(store.saved).toBeUndefined();
      p.nudgeCents(1);
      expect((store.saved as { settings: { key: number } }).settings.key).toBe(9);
    });

    it("takes a Custom sound from a link, and leaves the listener's own alone otherwise", () => {
      const mine = planFor({ ...DEFAULT_THAMBURA, mode: "guitar" });
      const theirs = planFor({ ...DEFAULT_THAMBURA, mode: "tambura" });
      const link = (mode: "custom" | "jawari") =>
        new FakeLink(encodeLink({ settings: { ...DEFAULT_THAMBURA, mode }, custom: theirs, view: "lab", open: true }));
      make({ custom: mine }, link("custom"));
      expect(p.state.custom).toEqual(theirs);
      make({ custom: mine }, link("jawari"));
      expect(p.state.custom).toEqual(mine);
    });

    it("says so when the link can't be read, and plays the saved setup", () => {
      make({ settings: { ...DEFAULT_THAMBURA, key: 3 } }, new FakeLink("not-a-link!"));
      expect(p.state.settings.key).toBe(3);
      expect(p.state.notice).toMatch(/isn't one this version can read/);
      p.dismissNotice();
      expect(p.state.notice).toBeNull();
    });
  });

  describe("muting strings in the Lab", () => {
    it("skips a muted string's plucks and fades what it was ringing", async () => {
      p.setView("lab");
      await start();
      run(6);
      p.setMuted(2, true);
      expect(audio.damped.at(-1)).toMatchObject({ group: "thambura/string2" });
      const n = audio.played.length;
      run(20);
      const strings = audio.played.slice(n).map((e) => e.opts?.choke);
      expect(strings).not.toContain("thambura/string2");
      expect(strings).toContain("thambura/string1");
      p.setMuted(2, false);
      const m = audio.played.length;
      run(30);
      expect(audio.played.slice(m).map((e) => e.opts?.choke)).toContain("thambura/string2");
    });

    it("solos one string, and brings the others back when soloed again", () => {
      p.setView("lab");
      p.solo(3);
      expect(p.state.muted).toEqual([true, true, true, false]);
      p.solo(3);
      expect(p.state.muted).toEqual([false, false, false, false]);
      p.setMuted(0, true);
      p.solo(1);
      expect(p.state.muted).toEqual([true, false, true, true]);
    });

    it("clears on leaving the Lab, and stays out of links and saved settings", () => {
      const link = new FakeLink();
      make(undefined, link);
      p.setView("lab");
      const before = link.writes.at(-1);
      p.setMuted(1, true);
      expect(p.state.muted[1]).toBe(true);
      expect(link.writes.at(-1)).toBe(before);
      expect(JSON.stringify(store.saved)).not.toContain("muted");
      p.setView("mini");
      expect(p.state.muted).toEqual([false, false, false, false]);
    });
  });

  describe("presets", () => {
    it("saves the current sound by name and plays it back, keeping the volume and view", () => {
      p.loadCustom("guitar");
      set({ key: 9, cents: 3 });
      const guitar = p.state.custom;
      const preset = p.savePreset("  Bright G  ");
      expect(preset.name).toBe("Bright G");
      expect(p.state.presets[0]).toEqual(preset);
      expect(presetStore.saved).toEqual([preset]);

      p.loadCustom("tambura");
      set({ key: 2, cents: 0, volume: 15 });
      p.setView("raagini");
      p.applyPreset(preset.id);
      expect(p.state.settings).toMatchObject({ key: 9, cents: 3, mode: "custom", volume: 15 });
      expect(p.state.custom).toEqual(guitar);
      expect(p.state.view).toBe("raagini");
    });

    it("names a nameless preset by number, newest first", () => {
      p.savePreset("");
      p.savePreset("");
      expect(p.state.presets.map((x) => x.name)).toEqual(["Preset 2", "Preset 1"]);
    });

    it("renames and deletes, and keeps them across visits", () => {
      const a = p.savePreset("a");
      const b = p.savePreset("b");
      p.renamePreset(a.id, "alpha");
      p.renamePreset(b.id, "   ");
      p.deletePreset(b.id);
      expect(p.state.presets.map((x) => x.name)).toEqual(["alpha"]);
      make(undefined, undefined, presetStore.saved);
      expect(p.state.presets.map((x) => x.name)).toEqual(["alpha"]);
    });

    it("drops malformed saved presets", () => {
      make(undefined, undefined, [{ id: "x", name: "ok", link: "ARw" }, { id: 1 }, null, "junk"]);
      expect(p.state.presets).toEqual([{ id: "x", name: "ok", link: "ARw" }]);
      make(undefined, undefined, { not: "a list" });
      expect(p.state.presets).toEqual([]);
    });

    it("ignores a preset whose link can't be read", () => {
      make(undefined, undefined, [{ id: "x", name: "broken", link: "nope" }]);
      const before = p.state.settings;
      p.applyPreset("x");
      expect(p.state.settings).toBe(before);
    });

    it("keeps the listener's own setup when a shared link replaces it, and only the latest", () => {
      const shared = (key: number) =>
        new FakeLink(encodeLink({ settings: { ...DEFAULT_THAMBURA, key }, custom: planFor(DEFAULT_THAMBURA), view: "lab", open: true }));
      const own = { settings: { ...DEFAULT_THAMBURA, key: 3 } };
      make(own, shared(9));
      const [kept] = p.state.presets;
      expect(kept).toMatchObject({ name: BEFORE_LINK_PRESET, auto: true });
      expect(p.state.notice).toBe("Opened a shared setup.");
      p.applyPreset(kept.id);
      expect(p.state.settings.key).toBe(3);
      expect(p.state.notice).toBeNull();

      const mine = p.savePreset("mine");
      make(own, shared(10), presetStore.saved);
      expect(p.state.presets.filter((x) => x.auto)).toHaveLength(1);
      expect(p.state.presets.map((x) => x.id)).toContain(mine.id);
    });

    it("keeps nothing extra when there was no setup, or the link plays the same sound", () => {
      const link = (settings: typeof DEFAULT_THAMBURA, view: "lab" | "mini") =>
        new FakeLink(encodeLink({ settings, custom: planFor(DEFAULT_THAMBURA), view, open: true }));
      make(undefined, link({ ...DEFAULT_THAMBURA, key: 9 }, "lab"));
      expect(p.state.presets).toEqual([]);
      make({ settings: { ...DEFAULT_THAMBURA, key: 9 }, view: "studio" }, link({ ...DEFAULT_THAMBURA, key: 9 }, "mini"));
      expect(p.state.presets).toEqual([]);
    });
  });

  it("saves settings, view and open state", () => {
    set({ key: 7 });
    p.setView("mini");
    p.toggleOpen();
    expect(store.saved).toEqual({ settings: { ...DEFAULT_THAMBURA, key: 7 }, view: "mini", open: true, custom: p.state.custom });
    expect(views.at(-1)?.view).toBe("mini");
  });

  it("keeps playing when the bar is hidden", async () => {
    p.setOpen(true);
    await start();
    p.toggleOpen();
    expect(p.state.open).toBe(false);
    expect(p.state.playing).toBe(true);
    expect(ticker.onTick).not.toBeNull();
  });
});
