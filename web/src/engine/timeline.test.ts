import { describe, expect, it } from "vitest";
import { BeatCursor } from "./cursor";
import { add, cmp, fromNumber, mul, ONE, parseRatio, ratio, ZERO } from "./ratio";
import { beatsFor, type TalaSettings } from "./selection";
import { TalaSequencer, type StepEvent, type TalaEvent, type TickEvent } from "./sequencer";
import { TempoMap } from "./tempoMap";

describe("ratio", () => {
  it("keeps fractions in lowest terms with a positive denominator", () => {
    expect(ratio(2, 4)).toEqual({ n: 1, d: 2 });
    expect(ratio(1, -2)).toEqual({ n: -1, d: 2 });
    expect(ratio(0, 5)).toEqual(ZERO);
    expect(() => ratio(1, 0)).toThrow();
    expect(() => ratio(0.5, 1)).toThrow();
  });

  it("adds, multiplies and compares exactly", () => {
    const third = ratio(1, 3);
    expect(add(add(third, third), third)).toEqual(ONE);
    expect(mul(ratio(5, 7), ratio(7, 2))).toEqual(ratio(5, 2));
    expect(cmp(ratio(2, 7), ratio(1, 3))).toBeLessThan(0);
    expect(cmp(ratio(3, 9), third)).toBe(0);
  });

  it("stays exact where floats drift", () => {
    let pos = ZERO;
    let float = 0;
    for (let i = 0; i < 1000; i++) {
      pos = add(pos, ratio(1, 7));
      float += 1 / 7;
    }
    expect(pos).toEqual(ratio(1000, 7));
    expect(float).not.toBe(1000 / 7);
  });

  it("recovers fractions from decimals", () => {
    expect(fromNumber(0.5)).toEqual(ratio(1, 2));
    expect(fromNumber(1 / 3)).toEqual(ratio(1, 3));
    expect(fromNumber(3.5)).toEqual(ratio(7, 2));
    expect(fromNumber(-0.25)).toEqual(ratio(-1, 4));
  });

  it("parses numbers, decimals and fraction strings", () => {
    expect(parseRatio(2, ZERO)).toEqual(ratio(2));
    expect(parseRatio("1.5", ZERO)).toEqual(ratio(3, 2));
    expect(parseRatio("1/2", ZERO)).toEqual(ratio(1, 2));
    expect(parseRatio("7/2", ZERO)).toEqual(ratio(7, 2));
  });

  it("falls back on junk and zero denominators", () => {
    expect(parseRatio(undefined, ONE)).toEqual(ONE);
    expect(parseRatio("abc", ONE)).toEqual(ONE);
    expect(parseRatio("1/0", ONE)).toEqual(ONE);
    expect(parseRatio("x/2", ONE)).toEqual(ONE);
  });
});

describe("TempoMap", () => {
  it("puts count 0 at the start time", () => {
    const map = new TempoMap(60);
    map.start(10);
    expect(map.secondsAt(ZERO)).toBe(10);
    expect(map.secondsAt(ratio(3, 2))).toBe(11.5);
  });

  it("changes tempo from the horizon on while running", () => {
    const map = new TempoMap(60);
    map.start(0);
    map.reach(2.1);
    map.setTempo(120);
    expect(map.secondsAt(ratio(3))).toBeCloseTo(2.1 + 0.9 * 0.5, 12);
    // A second change before the next pull re-anchors at the same place.
    map.setTempo(240);
    expect(map.secondsAt(ratio(3))).toBeCloseTo(2.1 + 0.9 * 0.25, 12);
  });

  it("only records the tempo while stopped", () => {
    const map = new TempoMap(60);
    map.setTempo(90);
    expect(map.bpm).toBe(90);
    expect(() => map.secondsAt(ZERO)).toThrow();
    map.start(5);
    expect(map.secondsAt(ratio(3))).toBe(7);
  });
});

/** A sequencer on its own map, pulled the way Transport pulls it. */
function setup(settings: Partial<TalaSettings> = {}, bpm = 60, start = 0) {
  const s: TalaSettings = { tala: "custom_rupakam", jaathi: "chatusram", nadai: "thisram", kalai: 1, ...settings };
  const cursor = new BeatCursor(beatsFor(s), s.kalai);
  const map = new TempoMap(bpm);
  const seq = new TalaSequencer(cursor, map, () => 0.25);
  map.start(start);
  seq.start(start);
  const pull = (now: number, until: number) => {
    const out = seq.pull(now, until);
    map.reach(until);
    return out;
  };
  return { cursor, map, seq, pull };
}

const steps = (evs: TalaEvent[]) => evs.filter((e): e is StepEvent => e.kind === "step");
const ticks = (evs: TalaEvent[]) => evs.filter((e): e is TickEvent => e.kind === "tick");

describe("TalaSequencer", () => {
  it("emits each step and tick once, when its own time comes into the window", () => {
    const { pull } = setup({}, 60, 10);
    // Short Rupakam in thisram: ticks at 0 and 1/3 of each one-count beat.
    expect(pull(10, 10.1).map((e) => [e.kind, e.time])).toEqual([
      ["step", 10],
      ["tick", 10],
    ]);
    expect(pull(10.05, 10.15)).toEqual([]);
    expect(pull(10.3, 10.4).map((e) => [e.kind, e.time])).toEqual([["tick", 10 + 1 / 3]]);
    const later = pull(11.95, 12.05);
    expect(steps(later).map((e) => [e.time, e.beat.image])).toEqual([
      [11, "down"],
      [12, "open"],
    ]);
  });

  it("places ticks at exact musical positions", () => {
    const { pull } = setup({}, 120);
    const evs = pull(0, 1);
    expect(ticks(evs).map((e) => e.at)).toEqual([ZERO, ratio(1, 3), ONE, ratio(4, 3)]);
    expect(ticks(evs).map((e) => e.time)).toEqual([0, 0.5 / 3, 0.5, 0.5 + 0.5 / 3]);
    expect(evs.every((e) => e.variant === 0.25)).toBe(true);
  });

  it("applies a tempo change past what has been handed out", () => {
    const { pull, map } = setup({}, 60);
    pull(0, 0.1); // the step at 0; the next is at count 1
    map.setTempo(120);
    // Count 0.1 stays at 0.1 s; from there each count is 0.5 s.
    expect(steps(pull(0.5, 0.6)).map((e) => e.time)).toEqual([0.55]);
  });

  it("lets a tempo change reach the rest of a long beat", () => {
    // Misra Chaapu is one beat of 7/2 counts, 21 s at 10 bpm, with ticks at
    // counts 0, 1/2, 3/2 and 5/2.
    const { pull, map } = setup({ tala: "chaapu_misram" }, 10);
    expect(ticks(pull(0, 0.1)).map((e) => e.time)).toEqual([0]);
    map.setTempo(20); // 3 s per count from 0.1 s (count 1/60) on
    const rest = ticks(pull(0.1, 10)).map((e) => e.time); // the next cycle starts at 10.55 s
    const at = (count: number) => 0.1 + (count - 1 / 60) * 3;
    expect(rest).toHaveLength(3);
    [0.5, 1.5, 2.5].forEach((count, i) => expect(rest[i]).toBeCloseTo(at(count), 9));
  });

  it("rewinds to the first unheard step on stop", () => {
    const { seq, cursor, pull } = setup({}, 60);
    pull(0, 1.1); // steps at 0 (beat 0) and 1 (beat 1); the cursor is on beat 2
    expect(cursor.position.beat).toBe(2);
    seq.stop(0.5); // the step at 1 hasn't started
    expect(cursor.position.beat).toBe(1);
    expect(seq.running).toBe(false);
    expect(seq.pull(2, 3)).toEqual([]);
  });

  it("keeps the cursor where it is when every pulled step was heard", () => {
    const { seq, cursor, pull } = setup({}, 60);
    pull(0, 0.1);
    seq.stop(0.5);
    expect(cursor.position.beat).toBe(1);
  });

  it("builds a manual beat at the current tempo without advancing", () => {
    const { seq, cursor } = setup({}, 60);
    const evs = seq.beatAt(3);
    expect(steps(evs).map((e) => [e.time, e.beat.image])).toEqual([[3, "down"]]);
    expect(ticks(evs).map((e) => e.time)).toEqual([3, 3 + 1 / 3]);
    expect(cursor.position.beat).toBe(0);
  });

  it("emits nothing for an empty cycle", () => {
    const map = new TempoMap(60);
    const seq = new TalaSequencer(new BeatCursor([]), map);
    map.start(0);
    seq.start(0);
    expect(seq.pull(0, 10)).toEqual([]);
    expect(seq.beatAt(0)).toEqual([]);
  });
});
