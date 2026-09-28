import { describe, expect, it } from "vitest";
import { withDefaultInstruments } from "./embedDefaults";

const tala = { name: "tala", slot: "t", config: {} };
const thambura = { name: "thambura", slot: "d", config: {} };

describe("withDefaultInstruments", () => {
  it("seeds what a host's islands need when the host names no instruments: the thambura, and the tala's claps", () => {
    const spec = withDefaultInstruments({ layout: "embed", islands: [tala, thambura], instruments: [] });
    expect(spec.instruments).toEqual([
      { kind: "thambura", config: {}, added: true },
      { kind: "hands", config: { fixturesUrl: "/static/Resources/TalasFixtures.json" } },
    ]);
  });

  it("leaves a host's own choice of claps alone", () => {
    const own = { kind: "hands", config: { fixturesUrl: "https://example.org/my-claps.json" } };
    expect(withDefaultInstruments({ layout: "embed", islands: [tala], instruments: [own] }).instruments).toEqual([own]);
    const drone = { kind: "thambura", config: {} };
    expect(withDefaultInstruments({ layout: "embed", islands: [thambura], instruments: [drone] }).instruments).toEqual([drone]);
  });

  it("adds nothing an island doesn't need", () => {
    expect(withDefaultInstruments({ layout: "embed", islands: [thambura], instruments: [] }).instruments).toEqual([{ kind: "thambura", config: {}, added: true }]);
    expect(withDefaultInstruments({ layout: "embed", islands: [], instruments: [] }).instruments).toEqual([]);
  });
});
