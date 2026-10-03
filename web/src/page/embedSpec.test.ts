import { describe, expect, it } from "vitest";
import { hostSpec } from "./embedSpec";

const things = (raw: Record<string, unknown>) => ({ things: Array.isArray(raw.things) ? raw.things : [] });

describe("hostSpec", () => {
  it("reads a host's spec, defaulting the layout, and keeps only what can be mounted", () => {
    const spec = hostSpec('{"islands":[{"name":"thambura","slot":"drone","presentation":"panel"},{"slot":"x"}]}', things);
    expect(spec).toEqual({ layout: "embed", islands: [{ name: "thambura", slot: "drone", presentation: "panel", config: {} }], things: [] });
  });

  it("keeps a layout the host names", () => {
    expect(hostSpec('{"layout":"notation","islands":[]}', things)?.layout).toBe("notation");
  });

  it("is null for no spec or a broken one", () => {
    for (const bad of [null, "", "{", "[]", '{"islands":"no"}']) expect(hostSpec(bad, things), String(bad)).toBeNull();
  });

  it("reads a spec object as it reads a script's text, filling in what a host leaves out", () => {
    // mount() takes an object (#143): no layout, no app fields, an island without config.
    const spec = hostSpec({ islands: [{ name: "tala", slot: "practice" }, { name: "thambura", slot: "drone" }] }, things);
    expect(spec).toEqual({
      layout: "embed",
      islands: [
        { name: "tala", slot: "practice", config: {} },
        { name: "thambura", slot: "drone", config: {} },
      ],
      things: [],
    });
    expect(hostSpec({ islands: [{ name: "x", slot: "BAD SLOT" }] }, things)?.islands).toEqual([]);
    for (const bad of [[], { islands: "no" }, 3]) expect(hostSpec(bad as never, things), JSON.stringify(bad)).toBeNull();
  });
});
