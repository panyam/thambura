import { describe, expect, it } from "vitest";
import { FULL_BEAT, MAX_ARC, MIN_BEAT, MOTION_OPTIONS, REST, SWING_DEPTH, isBeatMotion, motionAt } from "./motion";

const scale = (e: number, L: number) => motionAt("swing", e, L).scale;

describe("motionAt", () => {
  it("rests on the beat for every motion but the pop", () => {
    for (const { id } of MOTION_OPTIONS) {
      if (id === "pop") continue;
      expect(motionAt(id, 0, 0.75)).toEqual(REST);
      expect(motionAt(id, 0.75, 0.75)).toEqual(REST);
    }
  });

  it("swings over the whole of a short beat, deepest halfway", () => {
    expect(scale(0.25, 0.5)).toBeCloseTo(1 - SWING_DEPTH);
    expect(scale(0.1, 0.5)).toBeCloseTo(scale(0.4, 0.5));
  });

  it("holds still through a long beat until its last arc", () => {
    const start = 3 - MAX_ARC;
    expect(scale(1, 3)).toBe(1);
    expect(scale(start, 3)).toBe(1);
    expect(scale(start + MAX_ARC / 2, 3)).toBeCloseTo(1 - SWING_DEPTH);
  });

  it("falls faster into the beat than it moves mid-arc", () => {
    const step = 0.02;
    const landing = 1 - scale(0.5 - step, 0.5);
    const top = scale(0.25 + step, 0.5) - scale(0.25, 0.5);
    expect(landing).toBeGreaterThan(top * 5);
  });

  it("dips only near the end of the beat, and shallowly", () => {
    expect(motionAt("dip", 0.2, 0.75).scale).toBe(1);
    const deepest = Math.min(...[...Array(75).keys()].map((i) => motionAt("dip", i / 100, 0.75).scale));
    expect(deepest).toBeCloseTo(0.9, 2);
  });

  it("fades instead of resizing", () => {
    const mid = motionAt("fade", 0.375, 0.75);
    expect(mid.scale).toBe(1);
    expect(mid.opacity).toBeCloseTo(0.35);
    expect(motionAt("decay", 0.7, 0.75).opacity).toBeLessThan(0.4);
  });

  it("pops on the beat and settles", () => {
    expect(motionAt("pop", 0, 0.75).scale).toBeCloseTo(1.08);
    expect(motionAt("pop", 0.3, 0.75).scale).toBeCloseTo(1, 2);
    expect(motionAt("pop", 0, 0.2).scale).toBeCloseTo(1.08); // even at 300 bpm
  });

  it("lifts off and lands", () => {
    expect(motionAt("lift", 0.375, 0.75).lift).toBeCloseTo(1);
  });

  it("fades out for fast beats", () => {
    const deepest = (L: number) => 1 - scale(L / 2, L);
    expect(deepest(FULL_BEAT)).toBeCloseTo(SWING_DEPTH);
    expect(deepest((FULL_BEAT + MIN_BEAT) / 2)).toBeCloseTo(SWING_DEPTH / 2);
    expect(deepest(MIN_BEAT)).toBe(0);
    expect(deepest(0.2)).toBe(0); // 300 bpm
  });

  it("does nothing when off, outside the beat or for an empty one", () => {
    expect(motionAt("off", 0.375, 0.75)).toEqual(REST);
    expect(motionAt("swing", -0.1, 0.5)).toEqual(REST);
    expect(motionAt("swing", 0.7, 0.5)).toEqual(REST);
    expect(motionAt("swing", 0.2, 0)).toEqual(REST);
  });

  it("recognises its own ids", () => {
    expect(isBeatMotion("dip")).toBe(true);
    expect(isBeatMotion("spin")).toBe(false);
  });
});
