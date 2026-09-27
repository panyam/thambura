import { readSpec, type PageSpec } from "./spec";

/**
 * A spec as another site writes it: the islands it wants, and optionally
 * instruments and a layout. Anything left out is filled in the way our own
 * pages' specs are read (spec.ts, readSpec).
 */
export interface HostSpec {
  layout?: string;
  islands: { name: string; slot: string; presentation?: string; config?: Record<string, unknown> }[];
  instruments?: { kind: string; config?: Record<string, unknown> }[];
}

/**
 * A spec written by someone else's page, to embed islands in it: the text of
 * a `data-thambura-spec` script, or the object a host passes to `mount()`.
 * Same format as the specs our own pages carry (spec.ts), but a host needn't
 * name a layout, since it isn't one of ours; it defaults to "embed". Both
 * forms are read the same way, so a missing instrument list or island config
 * comes back empty rather than undefined (#143). Null when there is no spec
 * or it can't be read.
 */
export function hostSpec(value: string | HostSpec | null | undefined): PageSpec | null {
  if (!value) return null;
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const withLayout = { layout: "embed", ...(raw as Record<string, unknown>) };
  return readSpec(JSON.stringify(withLayout));
}
