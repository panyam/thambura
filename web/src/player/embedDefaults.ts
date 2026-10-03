import type { Spec } from "./spec";

/** Where the tala's sounds are, from the root; resolved against embed.js's address. */
const FIXTURES = "/static/Resources/TalasFixtures.json";

/**
 * A host's spec with the instruments its islands need. Our own pages seed
 * them from Go (internal/web/pages.go), which a host page can't: a
 * `thambura` island shows the `thambura` instrument, and the tala makes no
 * sound itself (it calls each tick on the clock for the hand claps to
 * play). So each is added when an island needs it and the host hasn't named
 * one. A host that names its own keeps them.
 */
export function withDefaultInstruments(spec: Spec): Spec {
  const shows = (name: string) => spec.islands.some((i) => i.name === name);
  const has = (kind: string) => spec.instruments.some((i) => i.kind === kind);
  const added = [
    // Added, so a host's thambura island has its thambura with a track list too (#157).
    ...(shows("thambura") && !has("thambura") ? [{ kind: "thambura", config: {}, added: true }] : []),
    ...(shows("tala") && !has("hands") ? [{ kind: "hands", config: { fixturesUrl: FIXTURES } }] : []),
  ];
  return added.length ? { ...spec, instruments: [...spec.instruments, ...added] } : spec;
}
