/**
 * The mridangam's strokes and how a kit tunes to the shruthi. Pure: no audio,
 * DOM or timers.
 *
 * A kit is a folder of recordings with a `kit.json` manifest (the tools that
 * build one live in the thambura-data repo). The manifest holds packs, each
 * recorded with the drum tuned near one note, and strokes, each with a few
 * takes per pack. A stroke id carries its head, `R.chapu` or `L.thom`, so the
 * right head's ta and the left head's tha can't be confused.
 *
 * A real drum only covers a few semitones, which is why a kit has several
 * packs: we play the one nearest the tonic and detune it the rest of the way.
 * Resampling scales the decay along with the pitch, so a stroke shifted far
 * sounds like a smaller drum, and `SHIFT_WARN_CENTS` is where we say so.
 */

export type Head = "left" | "right";

export interface Stroke {
  id: string;
  label: string;
  head: Head;
  /** Whether the head is left to ring. Closed strokes choke open ones. */
  open: boolean;
  /** A line for the view: where it's struck, what it sounds like. */
  note: string;
  /** Takes per pack id. A pack with no takes for this stroke is missing it. */
  takes: Record<string, string[]>;
}

/** One tuning of the drum. `hz` is its nominal Sa; `cents` is where it really sits. */
export interface Pack {
  id: string;
  label: string;
  hz: number;
  cents: number;
}

export interface Kit {
  kit: string;
  name: string;
  packs: Pack[];
  strokes: Stroke[];
}

/** A stroke ready to play: which file, and how far to shift it. */
export interface StrokeSound {
  url: string;
  detune: number;
  head: Head;
  open: boolean;
}

/** Past this much shifting, a take starts sounding like a different drum. */
export const SHIFT_WARN_CENTS = 200;

/** The pitch a pack actually sounds, once its measured offset is applied. */
export function packHz(pack: Pack): number {
  return pack.hz * 2 ** (pack.cents / 1200);
}

/**
 * The pack nearest `tonicHz`, by pitch class: a pack named C suits a singer's
 * Sa at C3, C4 or anywhere else, since the drum sounds an octave above the
 * tonic it accompanies.
 */
export function nearestPack(kit: Kit, tonicHz: number, strokeId?: string): Pack | null {
  const usable = strokeId ? kit.packs.filter((p) => hasTakes(kit, strokeId, p.id)) : kit.packs;
  let best: Pack | null = null;
  for (const pack of usable) {
    if (!best || Math.abs(shiftCents(pack, tonicHz)) < Math.abs(shiftCents(best, tonicHz))) best = pack;
  }
  return best;
}

/** How far a pack has to move to sound `tonicHz`, in cents, folded to the nearest octave. */
export function shiftCents(pack: Pack, tonicHz: number): number {
  const raw = 1200 * Math.log2(tonicHz / packHz(pack));
  return raw - 1200 * Math.round(raw / 1200);
}

/**
 * Which file to play for a stroke at this tonic, and how far to shift it.
 * `pick` chooses among the takes, so a caller can round-robin or draw one.
 * Null when the kit has no take for the stroke.
 */
export function strokeSound(
  kit: Kit,
  strokeId: string,
  tonicHz: number,
  pick: (takes: string[]) => string = (t) => t[0],
  baseUrl = "",
): StrokeSound | null {
  const stroke = kit.strokes.find((s) => s.id === strokeId);
  if (!stroke) return null;
  const pack = nearestPack(kit, tonicHz, strokeId);
  if (!pack) return null;
  const takes = stroke.takes[pack.id];
  if (!takes || takes.length === 0) return null;
  return {
    url: `${baseUrl}${pick(takes)}`,
    detune: shiftCents(pack, tonicHz),
    head: stroke.head,
    open: stroke.open,
  };
}

/** Every file the kit needs for this tonic, for preloading. */
export function kitUrls(kit: Kit, tonicHz: number, baseUrl = ""): string[] {
  const urls = new Set<string>();
  for (const stroke of kit.strokes) {
    const pack = nearestPack(kit, tonicHz, stroke.id);
    for (const take of (pack && stroke.takes[pack.id]) || []) urls.add(`${baseUrl}${take}`);
  }
  return [...urls];
}

/** Reads a kit.json, rejecting anything malformed rather than half-loading it. */
export function parseKit(json: unknown): Kit {
  if (!isRecord(json)) throw new Error("kit: expected a JSON object");
  const packs = asArray(json.packs, "packs").map((p, i) => {
    if (!isRecord(p)) throw new Error(`kit: packs[${i}] must be an object`);
    return {
      id: asString(p.id, `packs[${i}].id`),
      label: asString(p.label, `packs[${i}].label`),
      hz: asNumber(p.hz, `packs[${i}].hz`),
      cents: typeof p.cents === "number" ? p.cents : 0,
    };
  });
  const ids = new Set(packs.map((p) => p.id));
  const strokes = asArray(json.strokes, "strokes").map((s, i) => {
    if (!isRecord(s)) throw new Error(`kit: strokes[${i}] must be an object`);
    const takes: Record<string, string[]> = {};
    for (const [pack, files] of Object.entries(isRecord(s.takes) ? s.takes : {})) {
      if (!ids.has(pack)) throw new Error(`kit: strokes[${i}].takes names an unknown pack "${pack}"`);
      takes[pack] = asArray(files, `strokes[${i}].takes.${pack}`).map((f, j) =>
        asString(f, `strokes[${i}].takes.${pack}[${j}]`),
      );
    }
    const id = asString(s.id, `strokes[${i}].id`);
    const head: Head | null = s.head === "left" ? "left" : s.head === "right" ? "right" : null;
    if (!head) throw new Error(`kit: strokes[${i}].head must be "left" or "right"`);
    return {
      id,
      label: typeof s.label === "string" ? s.label : id,
      head,
      open: s.open !== false,
      note: typeof s.note === "string" ? s.note : "",
      takes,
    };
  });
  if (packs.length === 0) throw new Error("kit: no packs");
  if (strokes.length === 0) throw new Error("kit: no strokes");
  return {
    kit: typeof json.kit === "string" ? json.kit : "kit",
    name: typeof json.name === "string" ? json.name : "Mridangam",
    packs,
    strokes,
  };
}

function hasTakes(kit: Kit, strokeId: string, packId: string): boolean {
  const stroke = kit.strokes.find((s) => s.id === strokeId);
  return (stroke?.takes[packId]?.length ?? 0) > 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`kit: ${what} must be an array`);
  return v;
}

function asString(v: unknown, what: string): string {
  if (typeof v !== "string" || v === "") throw new Error(`kit: ${what} must be a non-empty string`);
  return v;
}

function asNumber(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`kit: ${what} must be a number`);
  return v;
}
