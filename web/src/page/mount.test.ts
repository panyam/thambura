import { describe, expect, it } from "vitest";
import { mountIslands, type Registry } from "./mount";
import type { PageSpec } from "./spec";

type El = { slot: string };
const ctx = { tag: "ctx" };
const bus = { tag: "bus" };

const spec: PageSpec = {
  layout: "drawer",
  islands: [
    { name: "tala", slot: "main", presentation: "page", config: { a: 1 } },
    { name: "hologram", slot: "side", config: {} },
    { name: "thambura", slot: "missing", config: {} },
    { name: "thambura", slot: "drawer", presentation: "drawer", config: {} },
  ],
  instruments: [],
};

describe("mountIslands", () => {
  it("mounts each island in its slot with its config and the page's context, in spec order", () => {
    const calls: unknown[][] = [];
    const registry: Registry<typeof ctx, El, string, typeof bus> = {
      tala: (el, island, c, b) => (calls.push([el, island, c, b]), "tala-component"),
      thambura: (el, island) => (calls.push([el, island.presentation]), "thambura-component"),
    };
    const logs: string[] = [];
    const out = mountIslands(spec, registry, (slot) => (slot === "missing" ? null : { slot }), () => ctx, bus, (m) => logs.push(m));
    expect(out).toEqual(["tala-component", "thambura-component"]);
    expect(calls).toEqual([
      [{ slot: "main" }, spec.islands[0], ctx, bus],
      [{ slot: "drawer" }, "drawer"],
    ]);
    // The unknown island and the missing slot are logged and skipped.
    expect(logs).toHaveLength(2);
    expect(logs.join("\n")).toMatch(/hologram/);
    expect(logs.join("\n")).toMatch(/missing/);
  });

  it("carries on when a factory throws", () => {
    const logs: string[] = [];
    const out = mountIslands(
      spec,
      {
        tala: () => {
          throw new Error("boom");
        },
        thambura: () => "ok",
      },
      (slot) => ({ slot }),
      () => ctx,
      bus,
      (m) => logs.push(m),
    );
    expect(out).toEqual(["ok", "ok"]);
    expect(logs.some((m) => m.includes("boom"))).toBe(true);
  });

  it("builds the page's context once, and only when there's an island to mount", () => {
    let built = 0;
    const context = () => (built++, ctx);
    mountIslands({ layout: "index", islands: [], instruments: [] }, {}, () => ({ slot: "" }), context, bus, () => {});
    expect(built).toBe(0);
    mountIslands(spec, { tala: () => "a", thambura: () => "b" }, (slot) => ({ slot }), context, bus, () => {});
    expect(built).toBe(1);
  });
});
