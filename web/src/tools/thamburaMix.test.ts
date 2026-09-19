import { describe, expect, it } from "vitest";
import { DEFAULT_THAMBURA } from "../engine/shruthi";
import { mixThambura } from "./thamburaMix";

describe("mixThambura", () => {
  const rms = (x: Float32Array, from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += x[i] * x[i];
    return Math.sqrt(s / (to - from));
  };

  it("plays every string, in both channels", () => {
    const m = mixThambura({ ...DEFAULT_THAMBURA, mode: "jawari", cycleSeconds: 4 }, 6, 8000);
    const plucks = m.events.filter((e) => !("damp" in e));
    expect(plucks.slice(0, 4).map((e) => e.string)).toEqual([0, 1, 2, 3]);
    expect(m.events.some((e) => "damp" in e)).toBe(true);
    expect(rms(m.left, 8000, 40000)).toBeGreaterThan(0.01);
    expect(rms(m.right, 8000, 40000)).toBeGreaterThan(0.01);
  });

  it("is the same for the same seed", () => {
    const s = { ...DEFAULT_THAMBURA, cycleSeconds: 3 };
    const a = mixThambura(s, 2, 8000, 7);
    const b = mixThambura(s, 2, 8000, 7);
    expect(a.left.every((v, i) => v === b.left[i])).toBe(true);
  });
});
