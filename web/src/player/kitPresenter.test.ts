import { beforeEach, describe, expect, it, vi } from "vitest";
import { KEY_C3, KEY_G3, DEFAULT_THAMBURA, tunedTonicHz } from "../engine/shruthi";
import { KitPresenter, ZONE_CHOKE_FADE, type KitState } from "./kitPresenter";
import { ratio } from "../engine/ratio";
import { HandsPresenter } from "./handsPresenter";
import { createClock, type Clock } from "./pageContext";
import { PlayerPresenter } from "./presenter";
import { FakeAudio, FakeFrames, FakeTicker } from "./testFakes";

const KIT = {
  kit: "test",
  name: "Test kit",
  instrument: "mridangam",
  zones: [
    { id: "right", label: "Right head" },
    { id: "left", label: "Left head" },
  ],
  packs: [
    { id: "c", label: "C", hz: 261.63, cents: 5 },
    { id: "g", label: "G", hz: 392.0, cents: 0 },
  ],
  strokes: [
    { id: "R.chapu", label: "Chapu", zone: "right", open: true, note: "the tuning stroke", takes: { c: ["cha-c-1.wav", "cha-c-2.wav"], g: ["cha-g-1.wav"] } },
    { id: "R.ta", label: "Ta", zone: "right", open: false, note: "closed", takes: { c: ["ta-c-1.wav"], g: ["ta-g-1.wav"] } },
    { id: "L.thom", label: "Thom", zone: "left", open: true, note: "open bass", takes: { c: ["thom-c-1.wav"] } },
    {
      id: "L.gumki",
      label: "Gumki",
      zone: "left",
      open: true,
      note: "thom with the pitch bent up",
      derived: { from: "L.thom", bend: { cents: 300, seconds: 0.25 } },
      takes: {},
    },
  ],
};

const KIT_URL = "/static/Resources/Mridangam/test/kit.json";

describe("KitPresenter", () => {
  let audio: FakeAudio;
  let frames: FakeFrames;
  let p: KitPresenter;
  let views: KitState[];

  const setup = async (json: unknown = KIT) => {
    p = new KitPresenter({
      audio,
      frames,
      fetchJson: async () => {
        if (json instanceof Error) throw json;
        return json;
      },
      rng: () => 0,
      track: "kit-1",
    });
    views = [];
    p.attach({ setState: (s) => views.push(s) });
    await p.load(KIT_URL);
  };

  beforeEach(() => {
    audio = new FakeAudio();
    frames = new FakeFrames();
  });

  it("loads a kit and preloads the samples for the current tonic", async () => {
    await setup();
    expect(p.state.status).toBe("ready");
    expect(p.state.kitName).toBe("Test kit");
    // The default thambura is C3, so the C pack, 5 cents sharp as measured.
    expect(p.state.packLabel).toBe("C");
    expect(p.state.shift).toBe(-5);
    expect(p.state.stretched).toBe(false);
    expect(audio.loaded).toEqual([
      "/static/Resources/Mridangam/test/cha-c-1.wav",
      "/static/Resources/Mridangam/test/cha-c-2.wav",
      "/static/Resources/Mridangam/test/ta-c-1.wav",
      "/static/Resources/Mridangam/test/thom-c-1.wav",
    ]);
  });

  it("stays off when the page has no kit, and says so once", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await setup(new Error("404 Not Found"));
    expect(p.state.status).toBe("off");
    expect(p.state.strokes).toEqual([]);
    expect(await p.play("R.chapu")).toBe(false);
    expect(audio.played).toEqual([]);
    expect(info).toHaveBeenCalledOnce();
    info.mockRestore();
  });

  it("gives every stroke a key and says which the kit can play", async () => {
    await setup();
    expect(p.state.strokes.map((s) => [s.label, s.key, s.playable])).toEqual([
      ["Chapu", "a", true],
      ["Ta", "s", true],
      ["Thom", "d", true],
      // Derived from thom, so it is playable without takes of its own.
      ["Gumki", "f", true],
    ]);
    expect(p.strokeForKey("A")).toBe("R.chapu");
    expect(p.strokeForKey("q")).toBeNull();
  });

  it("plays a stroke on its own track, choking only its own zone", async () => {
    await setup();
    audio.now = 4;
    expect(await p.play("R.chapu")).toBe(true);
    expect(audio.played).toHaveLength(1);
    expect(audio.played[0]).toMatchObject({
      url: "/static/Resources/Mridangam/test/cha-c-1.wav",
      bus: "kit-1",
      when: 4.01,
    });
    expect(audio.played[0].opts).toMatchObject({ choke: "kit/Test kit/right", chokeFade: ZONE_CHOKE_FADE });
    await p.play("L.thom");
    expect(audio.played[1].opts).toMatchObject({ choke: "kit/Test kit/left" });
  });

  it("works through the takes rather than repeating one", async () => {
    await setup();
    await p.play("R.chapu");
    await p.play("R.chapu");
    await p.play("R.chapu");
    expect(audio.played.map((n) => n.url.split("/").pop())).toEqual(["cha-c-1.wav", "cha-c-2.wav", "cha-c-1.wav"]);
  });

  it("follows the thambura's tonic, and loads the pack that suits it", async () => {
    await setup();
    audio.loaded.length = 0;
    p.setThambura({ ...DEFAULT_THAMBURA, key: KEY_G3 });
    await Promise.resolve();
    expect(p.state.tonicHz).toBeCloseTo(tunedTonicHz({ ...DEFAULT_THAMBURA, key: KEY_G3 }), 6);
    expect(p.state.packLabel).toBe("G");
    // An equal-tempered G3 is 196.0 Hz, so a 392 Hz drum is already there.
    expect(Math.abs(p.state.shift)).toBeLessThanOrEqual(1);
    // Thom is only recorded at C, so it comes from there, stretched.
    expect(audio.loaded).toContain("/static/Resources/Mridangam/test/thom-c-1.wav");
    expect(p.state.strokes.every((s) => s.playable)).toBe(true);
  });

  it("warns when the nearest pack is further than a drum stretches", async () => {
    await setup({ ...KIT, packs: [KIT.packs[0]], strokes: KIT.strokes.map((s) => ({ ...s, takes: { c: s.takes.c ?? [] } })) });
    p.setThambura({ ...DEFAULT_THAMBURA, key: KEY_C3, cents: 0 });
    p.setTonic(tunedTonicHz({ ...DEFAULT_THAMBURA, key: KEY_C3 }) * 2 ** (4 / 12));
    expect(p.state.packLabel).toBe("C");
    expect(p.state.shift).toBeGreaterThan(200);
    expect(p.state.stretched).toBe(true);
  });

  it("sets the bus volume and each zone's level", async () => {
    await setup();
    p.setVolume(40);
    expect(audio.busVolume["kit-1"]).toBe(40);
    p.setVolume(NaN);
    expect(p.state.volume).toBe(70);

    // Every zone starts at full, and a zone turned down only affects its own strokes.
    expect(p.state.levels).toEqual({ right: 1, left: 1 });
    p.setZoneLevel("right", 0);
    await p.play("R.chapu");
    await p.play("L.thom");
    expect(audio.played[0].opts?.gain).toBe(0);
    expect(audio.played[1].opts?.gain).toBe(1);
    p.setZoneLevel("right", 5);
    expect(p.state.levels.right).toBe(1);
    p.setZoneLevel("nosuchzone", 0.5);
    expect(p.state.levels.nosuchzone).toBeUndefined();
  });

  it("plays an unpitched kit as recorded", async () => {
    await setup({
      kit: "hands",
      name: "Hands",
      instrument: "hands",
      zones: [{ id: "hands", label: "Hands" }],
      packs: [{ id: "any", label: "" }],
      strokes: [{ id: "H.clap", label: "Clap", zone: "hands", open: true, note: "", takes: { any: ["clap.wav"] } }],
    });
    expect(p.state.pitched).toBe(false);
    p.setThambura({ ...DEFAULT_THAMBURA, key: KEY_G3 });
    await p.play("H.clap");
    expect(audio.played[0].opts?.detune).toBe(0);
  });

  it("bends a derived stroke as it plays it", async () => {
    await setup();
    await p.play("L.gumki");
    expect(audio.played).toHaveLength(1);
    expect(audio.played[0].url).toBe("/static/Resources/Mridangam/test/thom-c-1.wav");
    expect(audio.played[0].opts).toMatchObject({ bend: { cents: 300, seconds: 0.25 } });
    // The stroke it borrows from plays straight.
    await p.play("L.thom");
    expect(audio.played[1].opts?.bend).toBeUndefined();
  });

  it("lights a pad when its stroke is heard, not when it is scheduled", async () => {
    await setup();
    audio.now = 1;
    await p.play("R.chapu");
    frames.flush();
    expect(p.state.lit).toBeNull(); // scheduled at 1.01, not heard yet

    audio.now = 1.02;
    frames.flush();
    expect(p.state.lit).toBe("R.chapu");

    audio.now = 1.5;
    frames.flush();
    expect(p.state.lit).toBeNull();
  });
});

// Every stroke a pattern can name (patterns/strokes.json), one take each.
const DRUM_IDS = ["L.tham", "L.thom", "L.dheem", "R.chapu", "R.dhin", "R.nam", "R.dheem", "R.thi", "R.ta", "R.tha"];
const DRUM = {
  kit: "drum",
  name: "Drum",
  instrument: "mridangam",
  zones: [
    { id: "right", label: "Right head" },
    { id: "left", label: "Left head" },
  ],
  packs: [{ id: "c", label: "C", hz: 261.63, cents: 0 }],
  strokes: DRUM_IDS.map((id) => ({
    id,
    label: id,
    zone: id.startsWith("L.") ? "left" : "right",
    open: true,
    note: "",
    takes: { c: [`${id}.wav`] },
  })),
};

const TALA_FIXTURES = {
  SoundGroups: {
    Clap: { down: "/clap-hi.wav", open: "/clap-lo.wav", one: "/clap-lo.wav", two: "/clap-lo.wav", three: "/clap-lo.wav" },
  },
  ImageGroups: { Simple: { down: "/down.gif", open: "/open.gif", one: "/one.gif" } },
};

describe("KitPresenter on the tala's clock", () => {
  let audio: FakeAudio;
  let ticker: FakeTicker;
  let frames: FakeFrames;
  let tala: PlayerPresenter;
  let kit: KitPresenter;
  let kitStore: MemoryStore;
  let clock: Clock;

  const advance = (to: number) => {
    audio.now = to;
    ticker.onTick?.();
    frames.flush();
  };
  const strokes = () => audio.played.filter((n) => n.bus === "kit-1");
  const stroke = (n: { url: string }) => n.url.split("/").pop()!.replace(/\.wav$/, "");
  const claps = () => audio.played.filter((n) => n.bus === "hands-1");

  const setup = async (opts: { playerSaved?: unknown; kitSaved?: unknown } = {}) => {
    audio = new FakeAudio();
    ticker = new FakeTicker();
    frames = new FakeFrames();
    clock = createClock(audio, ticker);
    kitStore = new MemoryStore(opts.kitSaved);
    // The kit is made first, as the page makes it before mounting the tala.
    kit = new KitPresenter({
      audio,
      frames,
      fetchJson: async () => DRUM,
      rng: () => 0,
      clock,
      track: "kit-1",
      store: kitStore,
      legacyStore: new MemoryStore(opts.playerSaved),
    });
    kit.attach({ setState: () => {} });
    await kit.load("/Kits/drum/kit.json");
    const hands = new HandsPresenter({ audio, track: "hands-1", clock, fetchJson: async () => TALA_FIXTURES });
    await hands.load("/fixtures.json");
    tala = new PlayerPresenter({
      audio,
      clock,
      frames,
      fetchJson: async () => TALA_FIXTURES,
      preloadImages: async () => {},
    });
    tala.attach({ setState: () => {} });
    await tala.load("/fixtures.json");
    tala.setSettings({ tala: "custom_adi", nadai: "chatusram" });
    tala.setTempo(60);
    kit.setVariety("off");
  };

  beforeEach(() => setup());

  it("names the pattern it found, and falls back to one from the tala", () => {
    expect(kit.state.pattern).toBe("Adi sarvalaghu, chatusram");
    tala.setSettings({ tala: "chaapu_misram" });
    expect(kit.state.pattern).toBe("Misra Chaapu sarvalaghu");
    // Nobody has written one for Ata, or for Adi in khandam, so the tala's
    // own beats make a skeleton and the panel says where it came from.
    tala.setSettings({ tala: "sapta_ata", jaathi: "chatusram" });
    expect(kit.state.pattern).toBe("Generated from the tala");
    tala.setSettings({ tala: "custom_adi", nadai: "khandam" });
    expect(kit.state.pattern).toBe("Generated from the tala");
  });

  it("books strokes against the claps once the tala plays, on its own track", async () => {
    await tala.start();
    advance(0.05);
    expect(strokes().length).toBeGreaterThan(0);
    // The pattern opens on sam, where the tala's first clap is.
    expect(stroke(strokes()[0])).toBe("L.tham");
    expect(strokes()[0].when).toBe(claps()[0].when);
    expect(strokes()[0].opts!.gain).toBeGreaterThan(1); // sam is accented
    expect(audio.played.some((n) => n.bus === "percussion")).toBe(false);
  });

  it("plays the generated skeleton where the claps fall", async () => {
    tala.setSettings({ tala: "sapta_ata", jaathi: "chatusram" });
    await tala.start();
    advance(0.05);
    // Sam gets both heads, and the stroke lands with the clap.
    expect(stroke(strokes()[0])).toBe("L.tham");
    expect(strokes()[0].when).toBe(claps()[0].when);
  });

  it("lays the pattern out for the lane, an akshara at a time", () => {
    // Adi: eight aksharas, four slots each, the first holding tham then thi.
    const lane = kit.state.lane!;
    expect(lane.name).toBe("Adi sarvalaghu, chatusram");
    expect(lane.aksharas).toBe(8);
    expect(lane.strokes.slice(0, 3)).toEqual([
      { stroke: "L.tham", akshara: 0, within: 0 },
      { stroke: "R.thi", akshara: 0, within: 0.5 },
      { stroke: "R.nam", akshara: 1, within: 0 },
    ]);

    // A chaapu is one beat here, but its pattern is written in seven.
    tala.setSettings({ tala: "chaapu_misram" });
    expect(kit.state.lane!.aksharas).toBe(7);
    expect(kit.state.lane!.strokes[3]).toEqual({ stroke: "L.tham", akshara: 3, within: 0 });

    // The generated skeleton says what it is, so the view can too.
    tala.setSettings({ tala: "sapta_ata", jaathi: "chatusram" });
    expect(kit.state.lane!.source).toMatch(/^generated/);
  });

  it("lights a stroke when it is heard, not when it is booked", async () => {
    await tala.start();
    advance(0.04);
    // The first stroke is booked at 0.05 and hasn't reached the speakers.
    expect(strokes()[0].when).toBe(0.05);
    expect(kit.state.strokeIndex).toBeNull();

    advance(0.06);
    expect(kit.state.strokeIndex).toBe(0);
    advance(0.56);
    expect(kit.state.strokeIndex).toBe(1);

    // Stopping drops the strokes that never sounded.
    tala.stop();
    advance(1.1);
    expect(kit.state.strokeIndex).toBe(1);
  });

  it("plays the korvai once, then goes back to the accompaniment", async () => {
    tala.setTempo(240); // four counts a second, so a cycle is two seconds
    expect(kit.state.hasKorvai).toBe(true);
    await tala.start();
    advance(0.05);

    kit.askForKorvai();
    expect(kit.state.korvaiQueued).toBe(true);

    // The korvai takes the next cycle to be laid out, and the lane shows it
    // once it sounds.
    const names = new Set<string>();
    for (let t = 0.1; t < 8; t += 0.05) {
      advance(t);
      if (kit.state.lane) names.add(kit.state.lane.name);
    }
    expect([...names]).toContain("Adi korvai");
    // It played once, and the button is free again.
    expect(kit.state.korvaiQueued).toBe(false);
    expect(kit.state.lane!.name).not.toBe("Adi korvai");
  });

  it("forgets a korvai that was asked for but never played", async () => {
    await tala.start();
    advance(0.05);
    kit.askForKorvai();
    expect(kit.state.korvaiQueued).toBe(true);
    tala.stop();
    expect(kit.state.korvaiQueued).toBe(false);
  });

  it("has no korvai to offer for a tala without one", () => {
    tala.setSettings({ tala: "chaapu_misram" });
    expect(kit.state.hasKorvai).toBe(false);
    kit.askForKorvai();
    expect(kit.state.korvaiQueued).toBe(false);
  });

  it("takes back its own strokes when the tala stops, and nothing else's", async () => {
    await tala.start();
    advance(0.05);
    tala.stop();
    expect(audio.cancelled).toContain("kit-1");
    expect(audio.cancelled).not.toContain("percussion");
  });

  /** When a count falls on the audio clock, from the tala's own tempo map. */
  const secondsAt = (count: number) => clock.tempo.secondsAt(ratio(count));
  const at = (when: number) => audio.played.filter((n) => Math.abs(n.when - when) < 1e-9);

  it("stays on sam through a tempo change", async () => {
    tala.setTempo(240); // a cycle every two seconds
    await tala.start();
    for (let t = 0.05; t < 2.5; t += 0.05) advance(t);
    // Every cycle has the same claps, so sam is every perCycle-th one.
    const perCycle = claps().filter((n) => n.when < secondsAt(8)).length;
    tala.setTempo(150);
    for (let t = 2.5; t < 12; t += 0.05) advance(t);
    const sams = claps().filter((_, i) => i % perCycle === 0).map((n) => n.when);
    expect(sams.length).toBeGreaterThan(3);
    for (const when of sams) {
      expect(at(when).map((n) => n.url)).toContain("/clap-hi.wav");
      expect(at(when).filter((n) => n.bus === "kit-1").map(stroke)).toContain("L.tham");
    }
  });

  it("resumes where the tala resumes, so sam stays on sam", async () => {
    await tala.start();
    for (let t = 0.05; t < 2.1; t += 0.05) advance(t);
    // Beats 0 to 2 have been heard, so the tala will resume on beat 3.
    tala.stop();
    const before = audio.played.length;

    await tala.start();
    expect(clock.tala.value!.resumesAt).toEqual(ratio(3));
    for (let t = 2.1; t < 12; t += 0.05) advance(t);
    const after = audio.played.slice(before);
    const first = after.filter((n) => n.bus === "kit-1")[0];
    // The drum picks up on akshara 3 with the tala, on that akshara's stroke...
    expect(first.when).toBe(after.find((n) => n.bus === "hands-1")!.when);
    expect(stroke(first)).toBe("R.nam");
    // ...and its tham lands on the tala's next sam, five counts on.
    const sam = secondsAt(5);
    expect(at(sam).map((n) => n.url)).toContain("/clap-hi.wav");
    expect(at(sam).filter((n) => n.bus === "kit-1").map(stroke)).toContain("L.tham");
  });

  it("keeps Variety in its own store, taking the tala's old one once", () => {
    // setup() switched it off, and that went to the kit's own store.
    expect(kitStore.saved).toMatchObject({ variety: "off" });
    const own = new MemoryStore(null);
    const fresh = new KitPresenter({
      audio,
      frames,
      fetchJson: async () => DRUM,
      track: "kit-2",
      store: own,
      legacyStore: new MemoryStore({ variety: "lots" }),
    });
    expect(fresh.state.variety).toBe("lots");
    expect(own.saved).toMatchObject({ variety: "lots" });
    const kept = new KitPresenter({
      audio,
      frames,
      fetchJson: async () => DRUM,
      track: "kit-3",
      store: new MemoryStore({ variety: "off" }),
      legacyStore: new MemoryStore({ variety: "lots" }),
    });
    expect(kept.state.variety).toBe("off");
  });
});

describe("the tala on its own", () => {
  it("books no audio: the claps are the hands track's", async () => {
    const audio = new FakeAudio();
    const ticker = new FakeTicker();
    const tala = new PlayerPresenter({
      audio,
      clock: createClock(audio, ticker),
      frames: new FakeFrames(),
      fetchJson: async () => TALA_FIXTURES,
      preloadImages: async () => {},
    });
    await tala.load("/fixtures.json");
    await tala.start();
    audio.now = 1;
    ticker.onTick?.();
    expect(audio.played).toEqual([]);
  });
});

class MemoryStore {
  saved: unknown;
  constructor(initial: unknown = null) {
    this.saved = initial;
  }
  load() {
    return this.saved;
  }
  save(v: unknown) {
    this.saved = v;
  }
}
