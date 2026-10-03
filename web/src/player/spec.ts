import { readSpec, type PageSpec } from "@panyam/tsappkit";

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

/** Our page spec: goapplib's, plus the instruments (internal/web/spec.go embeds page.Spec the same way). */
export type Spec = PageSpec & { instruments: InstrumentSpec[] };

/**
 * The instruments in a parsed spec, for tsappkit's readSpec and IslandPage's
 * readExtension. Instruments without a kind are dropped, a config that isn't
 * an object becomes {}, a missing list is empty, and `added` is kept only
 * when it's true.
 */
export function readInstruments(raw: Record<string, unknown>): { instruments: InstrumentSpec[] } {
  const instruments: InstrumentSpec[] = [];
  for (const inst of Array.isArray(raw.instruments) ? raw.instruments : []) {
    if (!isObject(inst) || typeof inst.kind !== "string" || !inst.kind) continue;
    instruments.push({ kind: inst.kind, config: isObject(inst.config) ? inst.config : {}, ...(inst.added === true && { added: true }) });
  }
  return { instruments };
}

/** The spec in `text` with its instruments, or null when there is none or it isn't one. */
export function readPageSpec(text: string | null | undefined): Spec | null {
  return readSpec(text, readInstruments);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
