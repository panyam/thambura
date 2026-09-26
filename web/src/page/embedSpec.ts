import { readSpec, type PageSpec } from "./spec";

/**
 * A spec written by someone else's page, to embed islands in it. Same format
 * as the specs our own pages carry (spec.ts), but a host needn't name a
 * layout, since it isn't one of ours; it defaults to "embed". Null when there
 * is no spec or it can't be read.
 */
export function hostSpec(text: string | null | undefined): PageSpec | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const withLayout = { layout: "embed", ...(raw as Record<string, unknown>) };
  return readSpec(JSON.stringify(withLayout));
}
