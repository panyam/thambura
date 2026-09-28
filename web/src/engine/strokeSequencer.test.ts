import { describe, expect, it } from "vitest";
import { BeatCursor } from "./cursor";
import { ratio } from "./ratio";
import { beatsFor, type TalaSettings } from "./selection";
import { TalaSequencer, type StepEvent, type TalaEvent } from "./sequencer";
import { StrokeSequencer } from "./strokeSequencer";
import { TalaGrid } from "./talaGrid";
import { PATTERNS, type Pattern } from "./patterns";
import { TempoMap } from "./tempoMap";

// A dense Adi, with strokes inside each akshara, so the tests can see
// positions within a beat. It was Thambura's own Adi until the Mridangam app's
// replaced it; the tests are about the sequencer, not about which Adi plays.
const ADI: Pattern = {
  ...(PATTERNS.find((p) => p.id === "adi-chatusram-1") as Pattern),
  strokes: [
    { at: ratio(0, 32), stroke: "L.tham", gain: 1.15 },
    { at: ratio(2, 32), stroke: "R.thi", gain: 1.15 },
    { at: ratio(4, 32), stroke: "R.nam", gain: 1 },
    { at: ratio(6, 32), stroke: "R.thi", gain: 1 },
    { at: ratio(8, 32), stroke: "L.thom", gain: 1 },
    { at: ratio(10, 32), stroke: "R.thi", gain: 1 },
    { at: ratio(12, 32), stroke: "R.nam", gain: 1 },
    { at: ratio(14, 32), stroke: "R.thi", gain: 1 },
    { at: ratio(15, 32), stroke: "R.thi", gain: 1 },
    { at: ratio(16, 32), stroke: "L.tham", gain: 1.05 },
    { at: ratio(18, 32), stroke: "R.thi", gain: 1.05 },
    { at: ratio(20, 32), stroke: "R.nam", gain: 1 },
    { at: ratio(22, 32), stroke: "R.thi", gain: 1 },
    { at: ratio(24, 32), stroke: "L.thom", gain: 1 },
    { at: ratio(26, 32), stroke: "R.thi", gain: 1 },
    { at: ratio(28, 32), stroke: "R.nam", gain: 1 },
    { at: ratio(29, 32), stroke: "R.thi", gain: 1 },
    { at: ratio(30, 32), stroke: "R.nam", gain: 1 },
  ],
};

const SETTINGS: TalaSettings = { tala: "custom_adi", jaathi: "chatusram", nadai: "chatusram", kalai: 1 };

/** A sequencer on its own map, pulled the way Transport pulls it. */
function setup(patch: Partial<TalaSettings> = {}, bpm = 60, given: Pattern | null | undefined = undefined) {
  const settings = { ...SETTINGS, ...patch };
  const beats = beatsFor(settings);
  const grid = new TalaGrid(beats, settings.kalai);
  const chosen = given === undefined ? ADI : given;
  const map = new TempoMap(bpm);
  const seq = new StrokeSequencer(() => ({ grid, pattern: chosen }), map);
  map.start(0);
  seq.start(0);
  const pull = (now: number, until: number) => {
    const out = seq.pull(now, until);
    map.reach(until);
    return out;
  };
  return { grid, map, seq, pull };
}

describe("StrokeSequencer", () => {
  it("plays the pattern's strokes at their musical positions", () => {
    const { pull } = setup({}, 60); // one count a second
    const first = pull(0, 1.1);
    // The Adi sarvalaghu opens with tham on sam and thi halfway through akshara 1.
    expect(first.map((e) => [e.stroke, e.time])).toEqual([
      ["L.tham", 0],
      ["R.thi", 0.5],
      ["R.nam", 1],
    ]);
    expect(first[0].at).toEqual(ratio(0));
    expect(first[1].at).toEqual(ratio(1, 2));
    // Sam's akshara is accented, the next one is not.
    expect(first[0].gain).toBeGreaterThan(first[2].gain);
  });

  it("emits each stroke once and repeats the cycle", () => {
    const { pull } = setup({}, 60);
    const cycle = [...Array(8)].flatMap((_, i) => pull(i, i + 1));
    expect(cycle).toHaveLength(ADI.strokes.length);
    const next = pull(8, 8.6);
    expect(next.map((e) => [e.stroke, e.time, e.cycle])).toEqual([
      ["L.tham", 8, 1],
      ["R.thi", 8.5, 1],
    ]);
  });

  it("resumes partway through a cycle, from where the tala resumes", () => {
    const beats = beatsFor(SETTINGS);
    const grid = new TalaGrid(beats);
    const map = new TempoMap(60);
    // The tala resumes on akshara 3, so count 0 is three counts into the cycle.
    const seq = new StrokeSequencer(() => ({ grid, pattern: ADI }), map, () => ratio(3));
    map.start(0);
    seq.start(0);
    const out = seq.pull(0, 5.1);
    map.reach(5.1);
    // Akshara 3's strokes first, nothing from before it, and tham on the next sam.
    expect(out.slice(0, 3).map((e) => [e.stroke, e.time, e.cycle])).toEqual([
      ["R.nam", 0, 0],
      ["R.thi", 0.5, 0],
      ["R.thi", 0.75, 0],
    ]);
    expect(out.find((e) => e.stroke === "L.tham")).toMatchObject({ time: 1, cycle: 0 });
    expect(out.at(-1)).toMatchObject({ stroke: "L.tham", time: 5, cycle: 1, index: 0 });
  });

  it("stretches with kalai, since an akshara is then two counts", () => {
    const { pull } = setup({ kalai: 2 }, 60);
    expect(pull(0, 2.1).map((e) => [e.stroke, e.time])).toEqual([
      ["L.tham", 0],
      ["R.thi", 1],
      ["R.nam", 2],
    ]);
  });

  it("follows a tempo change like everything else on the map", () => {
    const { pull, map } = setup({}, 60);
    pull(0, 0.1);
    map.setTempo(120);
    // From the horizon on, a count is half a second.
    expect(pull(0.1, 1).map((e) => e.time)).toEqual([0.1 + 0.4 * 0.5, 0.1 + 0.9 * 0.5, 0.1 + 1.4 * 0.5]);
  });

  it("plays nothing for a tala with no pattern, and keeps counting cycles", () => {
    const { pull } = setup({ tala: "chaapu_misram" }, 60, null);
    expect(pull(0, 10)).toEqual([]);
    expect(pull(10, 20)).toEqual([]);
  });

  it("forgets what it hasn't played when it stops", () => {
    const { seq, pull } = setup({}, 60);
    pull(0, 1.1);
    seq.stop(0.5);
    expect(seq.pull(1, 4)).toEqual([]);
  });
});

describe("the tala and the mridangam together", () => {
  it("puts a stroke and a clap that share a position on the same time", () => {
    // One map, two voices, the way Transport drives them.
    const beats = beatsFor(SETTINGS);
    const grid = new TalaGrid(beats, 1);
    const map = new TempoMap(72);
    const tala = new TalaSequencer(new BeatCursor(beats, 1), map);
    const strokes = new StrokeSequencer(() => ({ grid, pattern: ADI }), map);
    map.start(0);
    tala.start(0);
    strokes.start(0);

    const claps = new Map<string, number>();
    const hits: { at: string; time: number }[] = [];
    const key = (r: { n: number; d: number }) => `${r.n}/${r.d}`;
    for (let now = 0; now < 30; now += 0.025) {
      const until = now + 0.1;
      for (const e of tala.pull(now, until) as TalaEvent[]) {
        if (e.kind === "step") claps.set(key((e as StepEvent).at), e.time);
      }
      for (const e of strokes.pull(now, until)) hits.push({ at: key(e.at), time: e.time });
      map.reach(until);
      if (Math.abs(now - 6) < 0.0125) map.setTempo(132);
      if (Math.abs(now - 17) < 0.0125) map.setTempo(54);
    }

    const shared = hits.filter((h) => claps.has(h.at));
    expect(shared.length).toBeGreaterThan(10);
    for (const h of shared) expect(claps.get(h.at)).toBe(h.time);
  });
});

describe("pattern slots", () => {
  it("places a khandam pattern's five slots evenly across the akshara", () => {
    const five: Pattern = {
      id: "k",
      name: "Khandam",
      source: "a test fixture",
      counts: ratio(1),
      shape: "down",
      nadai: "khandam",
      beats: 1,
      aksharas: 1,
      role: "main",
      strokes: ["R.ta", "R.tha", "R.thi", "R.ta", "R.tha"].map((stroke, i) => ({
        at: ratio(i, 5),
        stroke,
        gain: 1,
      })),
    };
    expect(five.strokes.map((s) => s.at.n / s.at.d)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
  });
});
