import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MOTION, motionAt, REST, SWING_DEPTH, type BeatPose } from "../engine/motion";
import { DEFAULT_SETTINGS } from "../engine/selection";
import { PlayerPresenter, type PlayerState } from "./presenter";
import { FakeAudio, FakeFrames, FakeTicker } from "./testFakes";

const FIXTURES = {
  RandomGroups: ["Swaras"],
  SoundGroups: {
    Clap: { down: "/clap-hi.wav", open: "/clap-lo.wav", one: "/clap-lo.wav", two: "/clap-lo.wav", three: "/clap-lo.wav" },
    Metronome: { down: "/tick-hi.wav", open: "/tick-lo.wav" },
  },
  ImageGroups: {
    Simple: { down: "/down.gif", open: "/open.gif", one: "/one.gif" },
    Swaras: { Sa: "/sa.png", Ri: "/ri.png" },
  },
};

describe("PlayerPresenter", () => {
  let audio: FakeAudio;
  let ticker: FakeTicker;
  let frames: FakeFrames;
  let p: PlayerPresenter;
  let views: PlayerState[];

  // Advance the audio clock, firing the transport tick and a frame.
  const advance = (to: number) => {
    audio.now = to;
    ticker.onTick?.();
    frames.flush();
  };

  beforeEach(async () => {
    audio = new FakeAudio();
    ticker = new FakeTicker();
    frames = new FakeFrames();
    p = new PlayerPresenter({
      audio,
      ticker,
      frames,
      fetchJson: async () => FIXTURES,
      preloadImages: async () => {},
      rng: () => 0.9,
    });
    views = [];
    p.attach({ setState: (s) => views.push(s) });
    await p.load("/fixtures.json");
  });

  it("loads the first sound and image groups and becomes ready", () => {
    expect(p.state.status).toBe("ready");
    expect(p.state.soundGroups).toEqual(["Clap", "Metronome"]);
    expect(p.state.soundGroup).toBe("Clap");
    expect(p.state.imageGroup).toBe("Simple");
    expect(p.state.image).toBe("/down.gif");
    expect(audio.loaded).toEqual(["/clap-hi.wav", "/clap-lo.wav"]);
    expect(audio.busVolume.tala).toBe(50);
    expect(views.at(-1)).toBe(p.state);
  });

  it("reports a fixture load failure", async () => {
    const q = new PlayerPresenter({
      audio,
      ticker,
      frames,
      fetchJson: async () => {
        throw new Error("404");
      },
      preloadImages: async () => {},
    });
    await q.load("/missing.json");
    expect(q.state.status).toBe("error");
    expect(q.state.error).toContain("/missing.json");
  });

  it("schedules the default thriputa cycle ahead on the audio clock", async () => {
    p.setTempo(60);
    await p.start();
    expect(audio.unlocked).toBe(1);
    expect(p.state.playing).toBe(true);
    // Start is 50ms out; the first tick looks 100ms ahead, so one step is in.
    expect(audio.played).toEqual([{ url: "/clap-hi.wav", bus: "tala", when: 0.05 }]);
    advance(1);
    expect(audio.played.map((x) => [x.url, x.when])).toEqual([
      ["/clap-hi.wav", 0.05],
      ["/clap-lo.wav", 1.05],
    ]);
  });

  it("shows each image when its sound is heard, not when scheduled", async () => {
    p.setTempo(60);
    audio.latency = 0.02;
    await p.start();
    advance(0.06); // heard 0.04: the step at 0.05 isn't audible yet
    expect(p.state.image).toBe("/down.gif");
    expect(p.state.position.beat).toBe(0);
    advance(1.07); // heard 1.05: second step ("one")
    expect(p.state.image).toBe("/one.gif");
    expect(p.state.position.beat).toBe(1);
  });

  describe("motion", () => {
    let poses: BeatPose[];
    const swing = () => (poses.at(-1) ?? REST).scale;
    const swingScale = (e: number, L: number) => motionAt("swing", e, L).scale;
    beforeEach(() => {
      poses = [];
      p.setMotion("swing");
      p.attach({ setState: () => {}, setPose: (x) => poses.push(x) });
    });

    it("holds, then arcs over the beat's last 0.8 s and lands on the next", async () => {
      p.setTempo(60); // beats at 0.05, 1.05, …
      await p.start();
      advance(0.2);
      expect(swing()).toBe(1);
      advance(0.65); // halfway through the arc from 0.25 to 1.05
      expect(swing()).toBeCloseTo(1 - SWING_DEPTH);
      advance(1.0); // the next step is booked now and ends the arc
      expect(swing()).toBeCloseTo(swingScale(0.95, 1));
      advance(1.06);
      expect(swing()).toBe(1);
    });

    it("moves the landing with a tempo change mid-beat", async () => {
      p.setTempo(60);
      await p.start();
      advance(0.3); // pulled to 0.4
      p.setTempo(120); // the beat's last 0.65 counts take 0.325 s from 0.4
      advance(0.5);
      expect(swing()).toBeCloseTo(swingScale(0.45, 0.675));
      advance(0.65); // the next beat is booked where the swing lands
      expect(audio.played.at(-1)!.when).toBeCloseTo(0.725);
      expect(swing()).toBeCloseTo(swingScale(0.6, 0.675));
    });

    it("rests at full size once stopped", async () => {
      p.setTempo(60);
      await p.start();
      advance(0.65);
      p.stop();
      expect(poses.at(-1)).toEqual(REST);
    });

    it("switches motion while playing", async () => {
      p.setTempo(60);
      await p.start();
      p.setMotion("fade");
      advance(0.65);
      expect(poses.at(-1)).toEqual(motionAt("fade", 0.6, 1));
      p.setMotion("off");
      advance(0.7);
      expect(poses.at(-1)).toEqual(REST);
    });
  });

  describe("saved choices", () => {
    const make = (saved: unknown, writes: unknown[] = []) =>
      new PlayerPresenter({
        audio,
        ticker,
        frames,
        fetchJson: async () => FIXTURES,
        preloadImages: async () => {},
        store: { load: () => saved, save: (v) => writes.push(v) },
      });

    it("restores every choice from the last visit", async () => {
      const settings = { tala: "chaapu_misram", jaathi: "khandam", nadai: "thisram", kalai: 2 };
      const q = make({ motion: "pop", settings, tempo: 72, volume: 30, soundGroup: "Metronome", imageGroup: "Swaras" });
      await q.load("/fixtures.json");
      expect(q.state).toMatchObject({ motion: "pop", settings, tempo: 72, volume: 30, soundGroup: "Metronome", imageGroup: "Swaras" });
      expect(audio.busVolume.tala).toBe(30);
      expect(q.state.beatCount).toBe(1); // a chaapu is one beat
    });

    it("saves on each change, and never while loading", async () => {
      const writes: unknown[] = [];
      const q = make(null, writes);
      await q.load("/fixtures.json");
      expect(writes).toEqual([]);
      q.setTempo(96);
      q.setSettings({ kalai: 3 });
      await q.setImageGroup("Swaras");
      expect(writes).toHaveLength(3);
      expect(writes.at(-1)).toEqual({
        motion: DEFAULT_MOTION,
        settings: { ...DEFAULT_SETTINGS, kalai: 3 },
        tempo: 96,
        volume: 50,
        soundGroup: "Clap",
        imageGroup: "Swaras",
      });
    });

    it("falls back to defaults for anything missing or no longer valid", async () => {
      const q = make({ motion: "spin", settings: { tala: "sapta_gone" }, tempo: 900, volume: "loud", imageGroup: "Deleted" });
      await q.load("/fixtures.json");
      expect(q.state).toMatchObject({ motion: DEFAULT_MOTION, settings: DEFAULT_SETTINGS, tempo: 300, volume: 50, imageGroup: "Simple" });
    });

    it("carries on when storage throws", async () => {
      const q = new PlayerPresenter({
        audio,
        ticker,
        frames,
        fetchJson: async () => FIXTURES,
        preloadImages: async () => {},
        store: {
          load: () => {
            throw new Error("blocked");
          },
          save: () => {
            throw new Error("full");
          },
        },
      });
      await q.load("/fixtures.json");
      q.setTempo(90);
      expect(q.state.tempo).toBe(90);
    });
  });

  it("shows no image for a name the group lacks", async () => {
    p.setTempo(60);
    await p.start();
    advance(2.1); // step 2 is "two"; Simple has no two.gif here
    expect(p.state.position.beat).toBe(2);
    expect(p.state.image).toBeNull();
  });

  it("cancels pending audio and rewinds to the first unheard step on stop", async () => {
    p.setTempo(60);
    await p.start();
    advance(1); // steps at 0.05 and 1.05 are scheduled
    p.stop();
    expect(p.state.playing).toBe(false);
    expect(audio.cancelled).toEqual(["tala"]);
    p.next(); // cursor is on step 1 (unheard), so next plays step 2
    expect(audio.played.at(-1)!.url).toBe("/clap-lo.wav");
  });

  it("steps manually only while stopped", async () => {
    p.next();
    await Promise.resolve();
    expect(audio.played).toHaveLength(1);
    await p.start();
    const before = audio.played.length;
    p.next();
    p.prev();
    expect(audio.played).toHaveLength(before);
  });

  it("restarts the cycle from the first beat", async () => {
    p.next();
    p.next();
    p.restart();
    await Promise.resolve();
    expect(audio.played.at(-1)!.url).toBe("/clap-hi.wav");
  });

  it("rebuilds the cycle on a settings change and keeps playing", async () => {
    await p.start();
    p.setSettings({ tala: "chaapu_misram" });
    await Promise.resolve();
    expect(p.state.beatCount).toBe(1);
    expect(p.state.settings.tala).toBe("chaapu_misram");
    expect(p.state.playing).toBe(true);
  });

  it("repeats each beat kalai times", async () => {
    p.setSettings({ kalai: 2 });
    p.setTempo(60);
    await p.start();
    advance(2);
    expect(audio.played.map((x) => x.url)).toEqual(["/clap-hi.wav", "/clap-hi.wav", "/clap-lo.wav"]);
  });

  it("picks from a random group with the step's draw", async () => {
    await p.setImageGroup("Swaras");
    expect(p.state.image).toBeNull(); // no "down" preview in a random group
    p.next();
    await Promise.resolve();
    frames.flush();
    audio.now = 1;
    frames.flush();
    expect(p.state.image).toBe("/ri.png"); // rng 0.9 of 2 entries
  });

  it("clamps tempo and volume", () => {
    p.setTempo(1000);
    p.setVolume(-5);
    expect(p.state.tempo).toBe(300);
    expect(p.state.volume).toBe(0);
    expect(audio.busVolume.tala).toBe(0);
  });
});

describe("PlayerPresenter with an instrument", () => {
  let audio: FakeAudio;
  let ticker: FakeTicker;
  let frames: FakeFrames;
  let p: PlayerPresenter;
  let booked: { id: string; when: number; gain?: number }[];
  let patterns: (string | null)[];

  const advance = (to: number) => {
    audio.now = to;
    ticker.onTick?.();
    frames.flush();
  };

  beforeEach(async () => {
    audio = new FakeAudio();
    ticker = new FakeTicker();
    frames = new FakeFrames();
    booked = [];
    patterns = [];
    p = new PlayerPresenter({
      audio,
      ticker,
      frames,
      fetchJson: async () => FIXTURES,
      preloadImages: async () => {},
      rng: () => 0.9,
      strokes: {
        playAt: (id, when, gain) => {
          booked.push({ id, when, gain });
          return true;
        },
        setPattern: (name) => patterns.push(name),
      },
    });
    p.attach({ setState: () => {} });
    await p.load("/fixtures.json");
    p.setSettings({ tala: "custom_adi", nadai: "chatusram" });
    p.setTempo(60);
  });

  it("names the pattern it found, and falls back to one from the tala", () => {
    expect(patterns.at(-1)).toBe("Adi sarvalaghu, chatusram");
    p.setSettings({ tala: "chaapu_misram" });
    expect(patterns.at(-1)).toBe("Misra Chaapu sarvalaghu");
    // Nobody has written one for Ata, or for Adi in khandam, so the tala's
    // own beats make a skeleton and the panel says where it came from.
    p.setSettings({ tala: "sapta_ata", jaathi: "chatusram" });
    expect(patterns.at(-1)).toBe("Generated from the tala");
    p.setSettings({ tala: "custom_adi", nadai: "khandam" });
    expect(patterns.at(-1)).toBe("Generated from the tala");
  });

  it("books strokes against the claps once playing", async () => {
    await p.start();
    advance(0.05);
    expect(booked.length).toBeGreaterThan(0);
    // The pattern opens on sam, where the tala's first clap is.
    const firstClap = audio.played.find((n) => n.bus === "tala")!.when;
    expect(booked[0]).toMatchObject({ id: "L.tham" });
    expect(booked[0].when).toBe(firstClap);
    expect(booked[0].gain).toBeGreaterThan(1); // sam is accented
  });

  it("plays the generated skeleton where the claps fall", async () => {
    p.setSettings({ tala: "sapta_ata", jaathi: "chatusram" });
    await p.start();
    advance(0.05);
    // Sam gets both heads, and the stroke lands with the clap.
    expect(booked[0]).toMatchObject({ id: "L.tham" });
    const firstClap = audio.played.find((n) => n.bus === "tala")!.when;
    expect(booked[0].when).toBe(firstClap);
  });

  it("takes back what hasn't sounded when it stops", async () => {
    await p.start();
    advance(0.05);
    p.stop();
    expect(audio.cancelled).toContain("percussion");
  });
});
