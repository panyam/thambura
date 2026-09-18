import { describe, expect, it } from "vitest";
import { parseNumber, toBeat } from "./beat";
import { chaapuBeats, customTalaBeats, laghuBeats, saptaTalaBeats, TICK_OFFSETS } from "./carnatic";
import { BeatCursor } from "./cursor";
import { beatsFor, clampTempo, usesJaathi, usesNadai } from "./selection";
import { TalaSequencer } from "./sequencer";
import { parseCatalog, resolveAsset } from "./assets";

const images = (beats: { image: string }[]) => beats.map((b) => b.image);

describe("parseNumber", () => {
  it("reads numbers, decimals and fractions", () => {
    expect(parseNumber(2)).toBe(2);
    expect(parseNumber("1.5")).toBe(1.5);
    expect(parseNumber("1/2")).toBe(0.5);
    expect(parseNumber("7/2")).toBe(3.5);
  });
  it("falls back on junk and zero denominators", () => {
    expect(parseNumber(undefined, 1)).toBe(1);
    expect(parseNumber("abc", 3)).toBe(3);
    expect(parseNumber("1/0", 4)).toBe(4);
    expect(parseNumber("x/2", 5)).toBe(5);
  });
});

describe("toBeat", () => {
  it("expands a bare name to a one-count beat with one tick", () => {
    expect(toBeat("open")).toEqual({ image: "open", duration: 1, ticks: [{ sound: "open", offset: 0 }] });
  });
  it("reads the object form with fraction strings", () => {
    const b = toBeat({ name: "down", duration: "1/2", ticks: [{ offset: "1/3" }, { sound: "open", offset: 0.5 }] });
    expect(b).toEqual({
      image: "down",
      duration: 0.5,
      ticks: [
        { sound: "down", offset: 1 / 3 },
        { sound: "open", offset: 0.5 },
      ],
    });
  });
});

describe("carnatic tables", () => {
  it("builds a laghu of jaathi counts: a clap then finger counts", () => {
    expect(images(laghuBeats("thisram", "chatusram"))).toEqual(["down", "one", "two"]);
    expect(images(laghuBeats("misram", "chatusram"))).toEqual(["down", "one", "two", "three", "four", "five", "one"]);
    expect(laghuBeats("sankeernam", "chatusram")).toHaveLength(9);
  });

  it("subdivides every beat by the nadai", () => {
    for (const beat of laghuBeats("chatusram", "khandam")) {
      expect(beat.ticks.map((t) => t.offset)).toEqual(TICK_OFFSETS.khandam);
    }
  });

  it("builds sapta talas from their angas", () => {
    expect(images(saptaTalaBeats("thriputa", "chatusram", "chatusram"))).toEqual([
      "down", "one", "two", "three", "down", "open", "down", "open",
    ]);
    expect(saptaTalaBeats("dhruva", "misram", "chatusram")).toHaveLength(7 + 2 + 7 + 7);
    expect(images(saptaTalaBeats("jhumpa", "thisram", "chatusram"))).toEqual(["down", "one", "two", "down", "down", "open"]);
    expect(images(saptaTalaBeats("rupaka", "chatusram", "chatusram"))).toEqual(["down", "open", "down", "one", "two", "three"]);
  });

  it("makes a chaapu one long beat on its own accent pattern", () => {
    const [beat, ...rest] = chaapuBeats("misram");
    expect(rest).toHaveLength(0);
    expect(beat.duration).toBe(3.5);
    expect(beat.ticks).toEqual(TICK_OFFSETS.misram.map((offset) => ({ sound: "down", offset })));
  });

  it("writes out the custom talas", () => {
    expect(images(customTalaBeats("adi", "chatusram"))).toEqual(["down", "one", "two", "three", "down", "open", "down", "open"]);
    expect(images(customTalaBeats("rupakam", "chatusram"))).toEqual(["down", "down", "open"]);
  });
});

describe("selection", () => {
  it("dispatches on the tala family", () => {
    expect(beatsFor({ tala: "sapta_eka", jaathi: "khandam", nadai: "chatusram", kalai: 1 })).toHaveLength(5);
    expect(beatsFor({ tala: "chaapu_khandam", jaathi: "misram", nadai: "misram", kalai: 1 })[0].duration).toBe(2.5);
    expect(beatsFor({ tala: "custom_rupakam", jaathi: "misram", nadai: "thisram", kalai: 1 })[0].ticks).toHaveLength(2);
  });
  it("says which settings each family reads", () => {
    expect([usesJaathi("sapta_ata"), usesNadai("sapta_ata")]).toEqual([true, true]);
    expect([usesJaathi("chaapu_misram"), usesNadai("chaapu_misram")]).toEqual([false, false]);
    expect([usesJaathi("custom_adi"), usesNadai("custom_adi")]).toEqual([false, true]);
  });
  it("clamps tempo", () => {
    expect(clampTempo(5)).toBe(10);
    expect(clampTempo(500)).toBe(300);
    expect(clampTempo(NaN)).toBe(80);
    expect(clampTempo(90.4)).toBe(90);
  });
});

describe("BeatCursor", () => {
  const beats = ["a", "b", "c"].map((s) => toBeat(s));

  it("repeats each beat kalai times and wraps forward", () => {
    const c = new BeatCursor(beats, 2);
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      seen.push(c.current()!.image);
      c.forward();
    }
    expect(seen).toEqual(["a", "a", "b", "b", "c", "c", "a"]);
  });

  it("wraps backward to the last repeat of the last beat", () => {
    const c = new BeatCursor(beats, 2);
    c.backward();
    expect(c.position).toEqual({ beat: 2, repeat: 1 });
    c.backward();
    c.backward();
    expect(c.position).toEqual({ beat: 1, repeat: 1 });
  });

  it("resets to the start when the beats change", () => {
    const c = new BeatCursor(beats);
    c.forward();
    c.setBeats(beats.slice(0, 2));
    expect(c.position).toEqual({ beat: 0, repeat: 0 });
  });

  it("does nothing when empty", () => {
    const c = new BeatCursor();
    c.forward();
    c.backward();
    expect(c.current()).toBeNull();
  });
});

describe("TalaSequencer", () => {
  const setup = (bpm = 60, kalai = 1) => {
    const cursor = new BeatCursor(beatsFor({ tala: "custom_rupakam", jaathi: "chatusram", nadai: "thisram", kalai }), kalai);
    const tempo = { bpm };
    return { cursor, tempo, seq: new TalaSequencer(cursor, tempo, () => 0.25) };
  };

  it("emits each step once, spaced by the tempo", () => {
    const { seq } = setup(60);
    seq.start(10);
    const first = seq.pull(10, 10.1);
    expect(first.map((e) => e.time)).toEqual([10]);
    expect(seq.pull(10.05, 10.15)).toEqual([]);
    const later = seq.pull(11.95, 12.05);
    expect(later.map((e) => [e.time, e.beat.image])).toEqual([
      [11, "down"],
      [12, "open"],
    ]);
  });

  it("places ticks at their offset within the step", () => {
    const { seq } = setup(120); // 0.5s per count; thisram ticks at 0 and 1/3
    seq.start(0);
    const [ev] = seq.pull(0, 0.1);
    expect(ev.duration).toBe(0.5);
    expect(ev.sounds.map((s) => s.time)).toEqual([0, 0.5 / 3]);
    expect(ev.variant).toBe(0.25);
  });

  it("applies a tempo change from the next step", () => {
    const { seq, tempo } = setup(60);
    seq.start(0);
    seq.pull(0, 0.1); // step at 0, next at 1
    tempo.bpm = 120;
    const evs = seq.pull(0.9, 1.6);
    expect(evs.map((e) => e.time)).toEqual([1, 1.5]);
  });

  it("rewinds to the first unheard step on stop", () => {
    const { seq, cursor } = setup(60);
    seq.start(0);
    seq.pull(0, 1.1); // steps at 0 (beat 0) and 1 (beat 1); cursor now at beat 2
    expect(cursor.position.beat).toBe(2);
    seq.stop(0.5); // the step at 1 hasn't started
    expect(cursor.position.beat).toBe(1);
    expect(seq.running).toBe(false);
    expect(seq.pull(2, 3)).toEqual([]);
  });

  it("keeps the cursor where it is when every pulled step was heard", () => {
    const { seq, cursor } = setup(60);
    seq.start(0);
    seq.pull(0, 0.1);
    seq.stop(0.5);
    expect(cursor.position.beat).toBe(1);
  });

  it("builds a manual step without advancing", () => {
    const { seq, cursor } = setup(60);
    expect(seq.stepAt(3)!.beat.image).toBe("down");
    expect(cursor.position.beat).toBe(0);
  });
});

describe("assets", () => {
  const catalog = parseCatalog({
    RandomGroups: ["Swaras"],
    SoundGroups: { Clap: { down: "/hi.wav", open: "/lo.wav", one: "/lo.wav" } },
    ImageGroups: { Simple: { down: "/down.gif" }, Swaras: { Sa: "/sa.png", Ri: "/ri.png" } },
  });

  it("parses groups in order and marks random ones", () => {
    expect(catalog.soundGroups.map((g) => g.name)).toEqual(["Clap"]);
    expect(catalog.imageGroups.map((g) => [g.name, g.random])).toEqual([
      ["Simple", false],
      ["Swaras", true],
    ]);
  });

  it("looks names up, returning null for a missing one", () => {
    const simple = catalog.imageGroups[0];
    expect(resolveAsset(simple, "down", 0.9)).toBe("/down.gif");
    expect(resolveAsset(simple, "guru_1", 0.9)).toBeNull();
  });

  it("picks by variant in a random group", () => {
    const swaras = catalog.imageGroups[1];
    expect(resolveAsset(swaras, "down", 0)).toBe("/sa.png");
    expect(resolveAsset(swaras, "down", 0.99)).toBe("/ri.png");
  });

  it("rejects malformed fixtures", () => {
    expect(() => parseCatalog([])).toThrow();
    expect(() => parseCatalog({ SoundGroups: { X: { down: 3 } }, ImageGroups: {} })).toThrow(/SoundGroups.X.down/);
  });
});
