import { describe, expect, it } from "vitest";
import { hostSpec } from "./embedSpec";

describe("hostSpec", () => {
  it("reads a host's spec, defaulting the layout, and keeps only what can be mounted", () => {
    const spec = hostSpec('{"islands":[{"name":"thambura","slot":"drone","presentation":"panel"},{"slot":"x"}]}');
    expect(spec).toEqual({ layout: "embed", islands: [{ name: "thambura", slot: "drone", presentation: "panel", config: {} }], instruments: [] });
  });

  it("keeps a layout the host names", () => {
    expect(hostSpec('{"layout":"notation","islands":[]}')?.layout).toBe("notation");
  });

  it("is null for no spec or a broken one", () => {
    for (const bad of [null, "", "{", "[]", '{"islands":"no"}']) expect(hostSpec(bad), String(bad)).toBeNull();
  });
});
