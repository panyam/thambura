import { describe, expect, it } from "vitest";
import { FULL_BEAT, MAX_ARC, MIN_BEAT, SWING_DEPTH, swingScale } from "./swing";

describe("swingScale", () => {
  it("is full size on the beat and at the next one", () => {
    expect(swingScale(0, 0.5)).toBe(1);
    expect(swingScale(0.5, 0.5)).toBe(1);
  });

  it("swings over the whole of a short beat, deepest halfway", () => {
    expect(swingScale(0.25, 0.5)).toBeCloseTo(1 - SWING_DEPTH);
    expect(swingScale(0.1, 0.5)).toBeCloseTo(swingScale(0.4, 0.5));
    expect(swingScale(0.1, 0.5)).toBeLessThan(1);
  });

  it("holds still through a long beat until its last arc", () => {
    const length = 3;
    const start = length - MAX_ARC;
    expect(swingScale(1, length)).toBe(1);
    expect(swingScale(start, length)).toBe(1);
    expect(swingScale(start + MAX_ARC / 2, length)).toBeCloseTo(1 - SWING_DEPTH);
  });

  it("falls faster into the beat than it moves mid-arc", () => {
    const step = 0.02;
    const landing = swingScale(0.5, 0.5) - swingScale(0.5 - step, 0.5);
    const top = swingScale(0.25 + step, 0.5) - swingScale(0.25, 0.5);
    expect(landing).toBeGreaterThan(top * 5);
  });

  it("fades out for fast beats", () => {
    const deepest = (length: number) => 1 - swingScale(length / 2, length);
    expect(deepest(FULL_BEAT)).toBeCloseTo(SWING_DEPTH);
    expect(deepest((FULL_BEAT + MIN_BEAT) / 2)).toBeCloseTo(SWING_DEPTH / 2);
    expect(deepest(MIN_BEAT)).toBe(0);
    expect(deepest(0.2)).toBe(0); // 300 bpm
  });

  it("stays full size outside the beat and for an empty one", () => {
    expect(swingScale(-0.1, 0.5)).toBe(1);
    expect(swingScale(0.7, 0.5)).toBe(1);
    expect(swingScale(0.2, 0)).toBe(1);
  });
});
