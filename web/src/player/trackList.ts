import type { AudioOut } from "./audio";
import type { Tracks } from "./pageContext";
import type { Store } from "./storage";

/** The kinds of instrument a page can have on it. */
export type TrackKind = "hands" | "thambura" | "kit";

const KINDS: TrackKind[] = ["hands", "thambura", "kit"];

/** One of the instruments the page spec offers: what can be put on the page. */
export interface CatalogEntry {
  kind: TrackKind;
  config: Record<string, unknown>;
}

/** An instrument on the page, as the list keeps it: its id, and for a kit which of the catalog's kits. */
export interface Placed {
  id: string;
  kind: TrackKind;
  /** For a kit, its index among the catalog's kits (their order in the spec). */
  kit?: number;
}

/** What the list shows for one instrument. */
export interface TrackRow extends Placed {
  muted: boolean;
  soloed: boolean;
  /** The claps can't be taken off while the tala is on the page; mute them instead. */
  removable: boolean;
}

/** Something that can be added now: a thambura while there's none, or a kit not yet on the page. */
export interface Addable {
  kind: TrackKind;
  kit?: number;
}

export interface TrackListState {
  rows: TrackRow[];
  addable: Addable[];
  /** The instrument just removed, while Undo can still bring it back. */
  removed: Placed | null;
}

export interface TrackListView {
  setState(state: TrackListState): void;
}

/** An instrument the page made, and how to take it off again. */
export interface Made<T> {
  instrument: T;
  dispose(): void;
}

export interface TrackListDeps<T> {
  catalog: CatalogEntry[];
  /**
   * Makes an instrument and puts it on the page (its audio track, the
   * clock, the shruthi, its part of the page link). `dispose` undoes all of it.
   */
  make(placed: Placed, entry: CatalogEntry): Made<T>;
  tracks: Tracks<T>;
  audio: Pick<AudioOut, "setMute" | "setSolo">;
  /** The page link, whose parts say which instruments a shared page had. */
  link?: { openedIds(): string[]; opened(id: string): string | null; remove(id: string): void };
  /** Reads a kit part's catalog index, so a link names which kit (engine/shareLink.ts, decodeKit). */
  kitOf?: (part: string) => number | null;
  /**
   * Where the list itself is kept (which instruments, which muted). Only a
   * page that shows the list has one; without it the page starts with the
   * spec's instruments every time, as `/` does.
   */
  store?: Store;
  /** Each instrument's own record, cleared on Remove and put back on Undo. */
  records: { load(id: string): unknown; save(id: string, value: unknown): void; clear(id: string): void };
  /** Runs `cb` after `ms`; returns a cancel. Undo lasts UNDO_MS. */
  defer(cb: () => void, ms: number): () => void;
}

/** How long Remove can be undone, in ms. */
export const UNDO_MS = 6000;

/**
 * The instruments on the page (#101): which are there, adding and removing
 * them, and mute and solo, which are the mixer's (audio.ts). It decides what
 * the page starts with: a shared link's instruments, else the list this
 * browser saved, else one of each kind the spec offers (the first kit only).
 * Removing an instrument clears its saved record, so adding it back starts
 * fresh, but Undo puts the record back for a few seconds.
 */
export class TrackList<T> {
  state: TrackListState;
  private readonly views: TrackListView[] = [];
  private readonly made = new Map<string, Made<T>>();
  private undo: { placed: Placed; record: unknown; cancel: () => void } | null = null;
  private placed: Placed[] = [];
  private readonly muted = new Set<string>();
  private readonly soloed = new Set<string>();

  constructor(private readonly deps: TrackListDeps<T>) {
    const saved = this.loadSaved();
    for (const id of saved?.muted ?? []) this.muted.add(id);
    for (const p of this.starting(saved?.tracks ?? null)) this.put(p);
    for (const id of this.muted) if (this.made.has(id)) deps.audio.setMute(id, true);
    this.state = this.read();
  }

  attach(view: TrackListView): void {
    this.views.push(view);
    view.setState(this.state);
  }

  // ---- intents -----------------------------------------------------------

  /** Puts an instrument on the page; one that can't be added now is ignored. */
  add(what: Addable): void {
    if (!this.state.addable.some((a) => a.kind === what.kind && a.kit === what.kit)) return;
    // Adding one back by hand ends the Undo for it; it starts fresh.
    if (this.undo && this.undo.placed.kind === what.kind && this.undo.placed.kit === what.kit) this.expireUndo();
    this.put({ id: this.nextId(what.kind), kind: what.kind, ...(what.kind === "kit" && { kit: what.kit }) });
    this.changed();
  }

  /** Takes an instrument off the page and clears what it saved, with Undo for a few seconds. */
  remove(id: string): void {
    const placed = this.placed.find((p) => p.id === id);
    if (!placed || !this.removable(placed)) return;
    this.expireUndo();
    let record: unknown = null;
    try {
      record = this.deps.records.load(id);
      this.deps.records.clear(id);
    } catch {
      // Storage can be blocked; there's nothing to clear or put back then.
    }
    this.take(placed);
    this.undo = { placed, record, cancel: this.deps.defer(() => this.expireUndo(true), UNDO_MS) };
    this.changed();
  }

  /** Brings back the instrument just removed, with what it had saved. */
  undoRemove(): void {
    const undo = this.undo;
    if (!undo) return;
    undo.cancel();
    this.undo = null;
    if (undo.record !== null && undo.record !== undefined) {
      try {
        this.deps.records.save(undo.placed.id, undo.record);
      } catch {
        // It comes back fresh instead.
      }
    }
    this.put(undo.placed);
    this.changed();
  }

  setMuted(id: string, muted: boolean): void {
    if (!this.made.has(id)) return;
    if (muted) this.muted.add(id);
    else this.muted.delete(id);
    this.deps.audio.setMute(id, muted);
    this.changed();
  }

  /** Solo is for listening, so it isn't saved. */
  setSoloed(id: string, soloed: boolean): void {
    if (!this.made.has(id)) return;
    if (soloed) this.soloed.add(id);
    else this.soloed.delete(id);
    this.deps.audio.setSolo(id, soloed);
    this.changed();
  }

  /** Where each of the page's kits is, by its index among them, for naming them before they load. */
  kitUrls(): string[] {
    return this.deps.catalog.filter((e) => e.kind === "kit").map((e) => String(e.config.url ?? ""));
  }

  /** The instrument on the page with this id, for its row's controls. */
  instrument(id: string): T | undefined {
    return this.made.get(id)?.instrument;
  }

  // ---- internals ---------------------------------------------------------

  private starting(saved: Placed[] | null): Placed[] {
    const fromLink = this.fromLink();
    if (this.deps.store && fromLink.length > 0) return fromLink;
    if (this.deps.store && saved) return saved.filter((p) => this.entry(p));
    const out: Placed[] = [];
    if (this.catalogHas("hands")) out.push({ id: "hands-1", kind: "hands" });
    if (this.catalogHas("thambura")) out.push({ id: "thambura-1", kind: "thambura" });
    if (this.catalogHas("kit")) out.push({ id: "kit-1", kind: "kit", kit: 0 });
    return out;
  }

  /** The instruments a shared link had parts for. The claps come along whatever it says. */
  private fromLink(): Placed[] {
    const out: Placed[] = [];
    for (const id of this.deps.link?.openedIds() ?? []) {
      const kind = kindOf(id);
      if (!kind) continue;
      if (kind === "kit") {
        const part = this.deps.link?.opened(id);
        const kit = part ? this.deps.kitOf?.(part) : null;
        if (kit === null || kit === undefined) continue;
        out.push({ id, kind, kit });
      } else {
        out.push({ id, kind });
      }
    }
    if (out.length > 0 && this.catalogHas("hands") && !out.some((p) => p.kind === "hands")) out.unshift({ id: "hands-1", kind: "hands" });
    return out.filter((p) => this.entry(p));
  }

  private put(placed: Placed): void {
    const entry = this.entry(placed);
    if (!entry || this.made.has(placed.id)) return;
    const made = this.deps.make(placed, entry);
    this.made.set(placed.id, made);
    this.placed.push(placed);
    this.deps.tracks.add(placed.id, made.instrument);
  }

  private take(placed: Placed): void {
    const made = this.made.get(placed.id);
    this.made.delete(placed.id);
    this.placed = this.placed.filter((p) => p.id !== placed.id);
    this.muted.delete(placed.id);
    this.soloed.delete(placed.id);
    this.deps.tracks.remove(placed.id);
    made?.dispose();
    this.deps.link?.remove(placed.id);
  }

  /** The catalog entry an instrument comes from, or undefined if the page doesn't offer it. */
  private entry(p: Placed): CatalogEntry | undefined {
    if (p.kind !== "kit") return this.deps.catalog.find((e) => e.kind === p.kind);
    return this.deps.catalog.filter((e) => e.kind === "kit")[p.kit ?? -1];
  }

  private catalogHas(kind: TrackKind): boolean {
    return this.deps.catalog.some((e) => e.kind === kind);
  }

  private removable(p: Placed): boolean {
    return p.kind !== "hands";
  }

  private nextId(kind: TrackKind): string {
    for (let n = 1; ; n++) if (!this.made.has(`${kind}-${n}`)) return `${kind}-${n}`;
  }

  private expireUndo(silently = false): void {
    if (!this.undo) return;
    this.undo.cancel();
    this.undo = null;
    if (silently) this.changed(false);
  }

  private read(): TrackListState {
    const kits = this.deps.catalog.filter((e) => e.kind === "kit");
    const addable: Addable[] = [];
    // A second thambura waits on #103, so it's offered only while there's none.
    if (this.catalogHas("thambura") && !this.placed.some((p) => p.kind === "thambura")) addable.push({ kind: "thambura" });
    kits.forEach((_, kit) => {
      if (!this.placed.some((p) => p.kind === "kit" && p.kit === kit)) addable.push({ kind: "kit", kit });
    });
    return {
      rows: this.placed.map((p) => ({ ...p, muted: this.muted.has(p.id), soloed: this.soloed.has(p.id), removable: this.removable(p) })),
      addable,
      removed: this.undo?.placed ?? null,
    };
  }

  private changed(save = true): void {
    this.state = this.read();
    for (const v of this.views) v.setState(this.state);
    if (save) this.save();
  }

  private save(): void {
    try {
      this.deps.store?.save({ tracks: this.placed, muted: [...this.muted] });
    } catch {
      // Storage can be full or blocked; the list still holds for this visit.
    }
  }

  private loadSaved(): { tracks: Placed[] | null; muted: string[] } | null {
    let raw: unknown;
    try {
      raw = this.deps.store?.load();
    } catch {
      return null;
    }
    if (!raw || typeof raw !== "object") return null;
    const r = raw as { tracks?: unknown; muted?: unknown };
    const tracks = Array.isArray(r.tracks) ? r.tracks.filter(isPlaced) : null;
    const muted = Array.isArray(r.muted) ? r.muted.filter((m): m is string => typeof m === "string") : [];
    return { tracks, muted };
  }
}

function kindOf(id: string): TrackKind | null {
  const kind = /^([a-z]+)-\d+$/.exec(id)?.[1];
  return KINDS.includes(kind as TrackKind) ? (kind as TrackKind) : null;
}

function isPlaced(v: unknown): v is Placed {
  if (!v || typeof v !== "object") return false;
  const p = v as Placed;
  return typeof p.id === "string" && kindOf(p.id) === p.kind && (p.kind !== "kit" || Number.isInteger(p.kit));
}
