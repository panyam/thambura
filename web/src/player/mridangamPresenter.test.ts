import { beforeEach, describe, expect, it, vi } from "vitest";
import { KEY_C3, KEY_G3, DEFAULT_THAMBURA, tunedTonicHz } from "../engine/shruthi";
import { HEAD_CHOKE_FADE, MridangamPresenter, type MridangamState } from "./mridangamPresenter";
import { FakeAudio, FakeFrames } from "./testFakes";

const KIT = {
  kit: "test",
  name: "Test kit",
  packs: [
    { id: "c", label: "C", hz: 261.63, cents: 5 },
    { id: "g", label: "G", hz: 392.0, cents: 0 },
  ],
  strokes: [
    { id: "R.chapu", label: "Chapu", head: "right", open: true, note: "the tuning stroke", takes: { c: ["cha-c-1.wav", "cha-c-2.wav"], g: ["cha-g-1.wav"] } },
    { id: "R.ta", label: "Ta", head: "right", open: false, note: "closed", takes: { c: ["ta-c-1.wav"], g: ["ta-g-1.wav"] } },
    { id: "L.thom", label: "Thom", head: "left", open: true, note: "open bass", takes: { c: ["thom-c-1.wav"] } },
  ],
};

const KIT_URL = "/static/Resources/Mridangam/test/kit.json";

describe("MridangamPresenter", () => {
  let audio: FakeAudio;
  let frames: FakeFrames;
  let p: MridangamPresenter;
  let views: MridangamState[];

  const setup = async (json: unknown = KIT) => {
    p = new MridangamPresenter({
      audio,
      frames,
      fetchJson: async () => {
        if (json instanceof Error) throw json;
        return json;
      },
      rng: () => 0,
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
    ]);
    expect(p.strokeForKey("A")).toBe("R.chapu");
    expect(p.strokeForKey("q")).toBeNull();
  });

  it("plays a stroke on the percussion bus, choking only its own head", async () => {
    await setup();
    audio.now = 4;
    expect(await p.play("R.chapu")).toBe(true);
    expect(audio.played).toHaveLength(1);
    expect(audio.played[0]).toMatchObject({
      url: "/static/Resources/Mridangam/test/cha-c-1.wav",
      bus: "percussion",
      when: 4.01,
    });
    expect(audio.played[0].opts).toMatchObject({ choke: "mridangam/right", chokeFade: HEAD_CHOKE_FADE });
    await p.play("L.thom");
    expect(audio.played[1].opts).toMatchObject({ choke: "mridangam/left" });
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

  it("sets the bus volume and mixes the heads", async () => {
    await setup();
    p.setVolume(40);
    expect(audio.busVolume.percussion).toBe(40);
    p.setVolume(NaN);
    expect(p.state.volume).toBe(70);

    p.setBalance(-1); // all thoppi
    await p.play("R.chapu");
    await p.play("L.thom");
    expect(audio.played[0].opts?.gain).toBe(0);
    expect(audio.played[1].opts?.gain).toBe(1);
    p.setBalance(5);
    expect(p.state.balance).toBe(1);
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
