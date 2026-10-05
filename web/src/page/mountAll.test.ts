import { describe, expect, it } from "vitest";
import { EventBus, lazy, type LCMComponent, type Registry } from "@panyam/tsappkit";
import { mountAll } from "./mountAll";

// A component that records which lifecycle steps it went through.
const component = (name: string, log: string[]): LCMComponent => ({
  performLocalInit: () => (log.push(`${name}:init`), []),
  setupDependencies: () => void log.push(`${name}:deps`),
  activate: () => void log.push(`${name}:activate`),
  deactivate: () => {},
});

describe("mountAll", () => {
  it("waits for lazy islands, then runs every island's lifecycle, in spec order", async () => {
    const log: string[] = [];
    const registry: Registry<object, object, LCMComponent, EventBus> = {
      plain: () => component("plain", log),
      later: lazy(async () => ({ default: () => component("later", log) })),
    };
    const spec = { layout: "", islands: [{ name: "later", slot: "a", config: {} }, { name: "plain", slot: "b", config: {} }] };
    const mounted = await mountAll(spec, registry, () => ({}), () => ({}), new EventBus(), () => {});
    expect(mounted).toHaveLength(2);
    expect(log).toContain("later:activate");
    expect(log).toContain("plain:activate");
    // Spec order: the lazy one first, though it mounted last.
    expect(log.indexOf("later:init")).toBeLessThan(log.indexOf("plain:init"));
  });

  it("doesn't wait forever for an island that can't mount", async () => {
    const messages: string[] = [];
    const registry: Registry<object, object, LCMComponent, EventBus> = {
      broken: lazy(async () => {
        throw new Error("no chunk");
      }),
    };
    const spec = { layout: "", islands: [{ name: "broken", slot: "a", config: {} }, { name: "unknown", slot: "b", config: {} }] };
    expect(await mountAll(spec, registry, () => ({}), () => ({}), new EventBus(), (m) => messages.push(m))).toEqual([]);
    expect(messages).toHaveLength(2);
  });

  it("resolves at once for a spec with no islands", async () => {
    expect(await mountAll({ layout: "", islands: [] }, {}, () => ({}), () => ({}), new EventBus(), () => {})).toEqual([]);
  });
});
