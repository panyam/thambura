/**
 * A struck instrument as a kit of recordings: what it can play, and how it
 * tunes to the shruthi. Pure: no audio, DOM or timers.
 *
 * A kit is a folder with a `kit.json` manifest (the tools that build one live
 * in the thambura-data repo). It describes one instrument, whichever it is:
 *
 * - **Zones** are the groups of strokes that choke each other, because one
 *   hand can only be in one place. A mridangam has two (its heads), a tabla
 *   two (its drums), a ghatam or a kanjira one, a drum kit several.
 * - **Packs** are tunings: the same instrument recorded at several pitches,
 *   since a real drum only covers a few semitones. We play the pack nearest
 *   the tonic and detune it the rest of the way. Resampling scales the decay
 *   along with the pitch, so a stroke shifted far sounds like a smaller drum,
 *   and `SHIFT_WARN_CENTS` is where we say so. A pack with no `hz` is
 *   unpitched, for an instrument that isn't tuned to the singer at all.
 * - **Strokes** are what you play: which zone, whether they ring, and a few
 *   takes per pack so repeats aren't identical.
 *
 * Nothing here knows what a mridangam is. That lives in the manifest.
 */

export interface Zone {
  id: string;
  label: string;
}

/**
 * A stroke played by bending another one, for a technique rather than a
 * different hit: a gumki is a thom whose pitch the player slides with the
 * other hand, so it is the thom's recording with the bend applied.
 */
export interface Derived {
  /** The stroke whose takes it plays. */
  from: string;
  /** How far the pitch slides, in cents, and over how long. */
  bend: { cents: number; seconds: number };
}

export interface Stroke {
  id: string;
  label: string;
  /** Which zone it belongs to. Strokes in a zone choke each other. */
  zone: string;
  /** Whether it is left to ring. A closed stroke chokes the open ones. */
  open: boolean;
  /** A line for the view: where it's struck, what it sounds like. */
  note: string;
  /** Takes per pack id. A pack with no takes for this stroke is missing it. */
  takes: Record<string, string[]>;
  /** Set when the stroke has no recordings of its own (see Derived). */
  derived?: Derived;
}

/** One tuning. `hz` is its nominal Sa; `cents` is where it really sits. */
export interface Pack {
  id: string;
  label: string;
  /** Missing on an unpitched kit, which is played as recorded. */
  hz?: number;
  cents: number;
}

export interface Kit {
  kit: string;
  name: string;
  /** What it is: "mridangam", "ghatam", "hands". For the view's wording. */
  instrument: string;
  zones: Zone[];
  packs: Pack[];
  strokes: Stroke[];
}

/** A stroke ready to play: which file, and how far to shift it. */
export interface StrokeSound {
  url: string;
  detune: number;
  zone: string;
  open: boolean;
  /** Set for a derived stroke: bend the pitch while it sounds. */
  bend?: { cents: number; seconds: number };
}

/** Past this much shifting, a take starts sounding like a different drum. */
export const SHIFT_WARN_CENTS = 200;

/** The pitch a pack actually sounds, once its measured offset is applied. */
export function packHz(pack: Pack): number {
  return (pack.hz ?? 0) * 2 ** (pack.cents / 1200);
}

/** Whether the kit is tuned to the singer at all. */
export function isPitched(kit: Kit): boolean {
  return kit.packs.some((p) => (p.hz ?? 0) > 0);
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
    // An unpitched pack is played as recorded, so it is always "nearest".
    if (!(pack.hz ?? 0)) return pack;
    if (!best || Math.abs(shiftCents(pack, tonicHz)) < Math.abs(shiftCents(best, tonicHz))) best = pack;
  }
  return best;
}

/** How far a pack has to move to sound `tonicHz`, in cents, folded to the nearest octave. */
export function shiftCents(pack: Pack, tonicHz: number): number {
  if (!(pack.hz ?? 0)) return 0;
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
  // A derived stroke plays the takes of the stroke it bends.
  const takesFrom = stroke.derived ? kit.strokes.find((s) => s.id === stroke.derived!.from) : stroke;
  if (!takesFrom) return null;
  const pack = nearestPack(kit, tonicHz, takesFrom.id);
  if (!pack) return null;
  const takes = takesFrom.takes[pack.id];
  if (!takes || takes.length === 0) return null;
  return {
    url: `${baseUrl}${pick(takes)}`,
    detune: shiftCents(pack, tonicHz),
    zone: stroke.zone,
    open: stroke.open,
    ...(stroke.derived ? { bend: stroke.derived.bend } : {}),
  };
}

/** Every file the kit needs for this tonic, for preloading. */
export function kitUrls(kit: Kit, tonicHz: number, baseUrl = ""): string[] {
  const urls = new Set<string>();
  for (const stroke of kit.strokes) {
    const from = stroke.derived ? kit.strokes.find((s) => s.id === stroke.derived!.from) : stroke;
    if (!from) continue;
    const pack = nearestPack(kit, tonicHz, from.id);
    for (const take of (pack && from.takes[pack.id]) || []) urls.add(`${baseUrl}${take}`);
  }
  return [...urls];
}

/** Reads a kit.json, rejecting anything malformed rather than half-loading it. */
export function parseKit(json: unknown): Kit {
  if (!isRecord(json)) throw new Error("kit: expected a JSON object");
  const packs = asArray(json.packs, "packs").map((p, i) => {
    if (!isRecord(p)) throw new Error(`kit: packs[${i}] must be an object`);
    const id = asString(p.id, `packs[${i}].id`);
    return {
      id,
      // An unpitched kit has one pack and nothing to call it.
      label: typeof p.label === "string" && p.label !== "" ? p.label : id,
      hz: p.hz === undefined ? undefined : asNumber(p.hz, `packs[${i}].hz`),
      cents: typeof p.cents === "number" ? p.cents : 0,
    };
  });
  const zones = asArray(json.zones, "zones").map((z, i) => {
    if (!isRecord(z)) throw new Error(`kit: zones[${i}] must be an object`);
    const id = asString(z.id, `zones[${i}].id`);
    return { id, label: typeof z.label === "string" ? z.label : id };
  });
  if (zones.length === 0) throw new Error("kit: no zones");
  const zoneIds = new Set(zones.map((z) => z.id));
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
    const zone = asString(s.zone, `strokes[${i}].zone`);
    if (!zoneIds.has(zone)) throw new Error(`kit: strokes[${i}].zone names an unknown zone "${zone}"`);
    let derived: Derived | undefined;
    if (isRecord(s.derived)) {
      const bend = isRecord(s.derived.bend) ? s.derived.bend : {};
      derived = {
        from: asString(s.derived.from, `strokes[${i}].derived.from`),
        bend: {
          cents: asNumber(bend.cents, `strokes[${i}].derived.bend.cents`),
          seconds: asNumber(bend.seconds, `strokes[${i}].derived.bend.seconds`),
        },
      };
    }
    return {
      id,
      label: typeof s.label === "string" ? s.label : id,
      zone,
      open: s.open !== false,
      note: typeof s.note === "string" ? s.note : "",
      takes,
      ...(derived ? { derived } : {}),
    };
  });
  if (packs.length === 0) throw new Error("kit: no packs");
  if (strokes.length === 0) throw new Error("kit: no strokes");
  return {
    kit: typeof json.kit === "string" ? json.kit : "kit",
    name: typeof json.name === "string" ? json.name : "Kit",
    instrument: typeof json.instrument === "string" ? json.instrument : "instrument",
    zones,
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
