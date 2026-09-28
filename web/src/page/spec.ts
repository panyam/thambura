/**
 * The page spec: which islands a page mounts, where, and with what config.
 * The server writes it into the page as JSON (internal/page on the Go side);
 * this reads it back. Knows nothing about Thambura, so it can move into
 * tsappkit later (panyam/goapplib#27).
 */

/** One island: `name` picks its factory, `slot` the element it mounts in (`[data-slot]`). */
export interface IslandSpec {
  name: string;
  slot: string;
  /** How the layout shows it ("page", "panel", "drawer", "strip"), when it draws differently in each. */
  presentation?: string;
  /** Handed to the factory as is. Always an object. */
  config: Record<string, unknown>;
}

/**
 * An instrument the page starts with. `kind` picks what the page builds.
 * Instruments come and go in the browser after that, so these are only the
 * starting set, kept apart from the islands, which are views.
 */
export interface InstrumentSpec {
  kind: string;
  /** Handed to whatever builds it, as is. Always an object. */
  config: Record<string, unknown>;
  /**
   * On the page from the start rather than only offered, where the page has
   * a list to add instruments from (#157). Present only when true.
   */
  added?: boolean;
}

export interface PageSpec {
  /** The arrangement of slots, for state kept per layout. */
  layout: string;
  islands: IslandSpec[];
  instruments: InstrumentSpec[];
}

// Slot names go into an attribute selector, so they must stay plain (as Go checks).
const SLOT = /^[a-z][a-z0-9-]*$/;

/**
 * The spec in `text`, or null when there is none or it isn't one. Islands
 * without a name or with a slot name that isn't plain are dropped, and a
 * config that isn't an object becomes {}, so what comes back can be mounted.
 * Instruments without a kind are dropped too, and a missing list is empty;
 * an instrument's `added` is kept only when it's true.
 */
export function readSpec(text: string | null | undefined): PageSpec | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw) || typeof raw.layout !== "string" || !Array.isArray(raw.islands)) return null;
  const islands: IslandSpec[] = [];
  for (const is of raw.islands) {
    if (!isObject(is) || typeof is.name !== "string" || !is.name || typeof is.slot !== "string" || !SLOT.test(is.slot)) continue;
    islands.push({
      name: is.name,
      slot: is.slot,
      ...(typeof is.presentation === "string" && { presentation: is.presentation }),
      config: isObject(is.config) ? is.config : {},
    });
  }
  const instruments: InstrumentSpec[] = [];
  for (const inst of Array.isArray(raw.instruments) ? raw.instruments : []) {
    if (!isObject(inst) || typeof inst.kind !== "string" || !inst.kind) continue;
    instruments.push({ kind: inst.kind, config: isObject(inst.config) ? inst.config : {}, ...(inst.added === true && { added: true }) });
  }
  return { layout: raw.layout, islands, instruments };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
