import { describe, expect, it } from "vitest";
import { readSpec } from "./spec";

describe("readSpec", () => {
  it("treats a spec without instruments as starting with none", () => {
    expect(readSpec('{"layout":"drawer","islands":[]}')).toEqual({ layout: "drawer", islands: [], instruments: [] });
  });

  it("reads the spec the server writes", () => {
    const text = JSON.stringify({
      layout: "drawer",
      islands: [
        { name: "tala", slot: "main", presentation: "page", config: { fixturesUrl: "/f.json", kitUrls: ["/a/kit.json"] } },
        { name: "thambura", slot: "drawer", presentation: "drawer", config: {} },
      ],
      instruments: [{ kind: "kit", config: { url: "/a/kit.json" } }],
    });
    expect(readSpec(text)).toEqual({
      layout: "drawer",
      islands: [
        { name: "tala", slot: "main", presentation: "page", config: { fixturesUrl: "/f.json", kitUrls: ["/a/kit.json"] } },
        { name: "thambura", slot: "drawer", presentation: "drawer", config: {} },
      ],
      instruments: [{ kind: "kit", config: { url: "/a/kit.json" } }],
    });
  });

  it("keeps an instrument's added flag when it's true, and nothing else (#157)", () => {
    const spec = readSpec(
      JSON.stringify({
        layout: "tracks",
        islands: [],
        instruments: [
          { kind: "kit", config: {}, added: true },
          { kind: "kit", config: {}, added: "yes" },
          { kind: "kit", config: {}, added: false },
        ],
      }),
    );
    expect(spec?.instruments).toEqual([
      { kind: "kit", config: {}, added: true },
      { kind: "kit", config: {} },
      { kind: "kit", config: {} },
    ]);
  });

  it("is null when there's no spec or it isn't one", () => {
    for (const bad of [null, undefined, "", "not json", "null", "[]", '{"islands":[]}', '{"layout":"drawer"}', '{"layout":3,"islands":[]}']) {
      expect(readSpec(bad), String(bad)).toBeNull();
    }
  });

  it("drops islands it couldn't mount and cleans the rest", () => {
    const spec = readSpec(
      JSON.stringify({
        layout: "drawer",
        islands: [
          { name: "tala", slot: "main" },
          { slot: "orphan" },
          { name: "x", slot: 'main"] , body' },
          { name: "thambura", slot: "drawer", presentation: 7, config: "nope" },
          "junk",
        ],
        instruments: [{ kind: "kit", config: 3 }, { config: {} }, { kind: "" }, null],
      }),
    );
    expect(spec).toEqual({
      layout: "drawer",
      islands: [
        { name: "tala", slot: "main", config: {} },
        { name: "thambura", slot: "drawer", config: {} },
      ],
      instruments: [{ kind: "kit", config: {} }],
    });
  });
});
