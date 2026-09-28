/**
 * Where each part of the app keeps its state. Every key goes through here,
 * through a Storage scope: our own pages use pageStorage (localStorage, under
 * `thambura.`), and an embed uses embedStorage, which writes nothing unless
 * its host names a space (#144). An instrument keeps its state under its id
 * on the page (`thambura.thambura-1`, `thambura.kit-1`), so two of a kind
 * don't share a record; the named keys below are the page's own, and the old
 * ones read once for a migration (docs/designs/instruments.md).
 */
const PREFIX = "thambura.";

const KEYS = {
  /** The tala player's choices (presenter.ts). */
  player: "player",
  /**
   * The one thambura's settings, view and Custom plan before instance ids.
   * `thambura-1` reads it once (see `withFallback`); nothing writes it any more.
   */
  drone: "drone",
  /** The thambura's saved presets. A preset is a sound, so any thambura can play it. */
  presets: "presets",
  /** Which instruments are on a page that shows the track list (trackList.ts), and which are muted. */
  tracks: "tracks",
  /** The page's Sa, which every pitched instrument plays to (pageContext.ts, Shruthi). */
  shruthi: "shruthi",
  /** Whether the thambura's Lab shows each control's description. */
  lab: "lab.descriptions",
} as const;

export type StoreName = keyof typeof KEYS;

/** The key our own pages keep `name` under. */
export function storageKey(name: StoreName): string {
  return PREFIX + KEYS[name];
}

/** A value kept as JSON under `name`'s key. Throws are the caller's to catch, as every presenter does. */
export interface Store {
  load(): unknown;
  save(value: unknown): void;
}

/** Where the instrument with this id keeps its state on our own pages. */
export function instrumentKey(id: string): string {
  return PREFIX + id;
}

/**
 * Where a page keeps what it saves: the page's own records by name, each
 * instrument's by its id, and a way to forget an instrument's. Everything
 * that saves is handed one (buildContext), so where a page's state goes is
 * decided in one place: localStorage for our pages, and for an embed,
 * nowhere or a space its host names.
 */
export interface Storage {
  store(name: StoreName): Store;
  instrument(id: string): Store;
  /**
   * Forgets what the instrument with this id saved, for the track list's
   * Remove. The first thambura's pre-id record goes too, or a thambura added
   * back would take it up again (`withFallback`).
   */
  clear(id: string): void;
}

/** Our own pages' storage: localStorage, under today's `thambura.` keys. */
export function pageStorage(): Storage {
  return prefixed(PREFIX);
}

// A space name goes into every key, so it may only be plain: no dots to
// reach another space's keys, and short.
const SPACE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * localStorage under `thambura.<name>.`, for an embed whose host asks for its
 * listeners' choices to be remembered. Two names never share a key. Throws
 * on a name that isn't lowercase letters, digits and dashes (up to 40).
 */
export function namedStorage(name: string): Storage {
  if (!SPACE.test(name)) throw new Error(`thambura: storage name ${JSON.stringify(name)} must be lowercase letters, digits and dashes`);
  return prefixed(`${PREFIX}${name}.`);
}

/** Storage that lasts for the visit and writes nowhere. Each call is its own. */
export function memoryStorage(): Storage {
  const m = new Map<string, unknown>();
  const at = (key: string): Store => ({ load: () => (m.has(key) ? m.get(key) : null), save: (v) => void m.set(key, v) });
  return {
    store: (name) => at(KEYS[name]),
    instrument: (id) => at(`#${id}`),
    clear: (id) => {
      m.delete(`#${id}`);
      if (id === "thambura-1") m.delete(KEYS.drone);
    },
  };
}

/**
 * An embed's storage: nothing written to the host's site unless the host
 * names a space (`mount(spec, {storage})`, or a spec script's
 * `data-storage`), since it's the host's storage, not ours.
 */
export function embedStorage(name: string | undefined): Storage {
  return name ? namedStorage(name) : memoryStorage();
}

/** Our own pages' store for `name` (pageStorage().store). */
export function localStore(name: StoreName): Store {
  return pageStorage().store(name);
}

/** Our own pages' store for the instrument with this id (pageStorage().instrument). */
export function instrumentStore(id: string): Store {
  return pageStorage().instrument(id);
}

/** Forgets an instrument's record on our own pages (pageStorage().clear). */
export function clearInstrument(id: string): void {
  pageStorage().clear(id);
}

function prefixed(prefix: string): Storage {
  return {
    store: (name) => keyStore(prefix + KEYS[name]),
    instrument: (id) => keyStore(prefix + id),
    clear: (id) => {
      localStorage.removeItem(prefix + id);
      if (id === "thambura-1") localStorage.removeItem(prefix + KEYS.drone);
    },
  };
}

/**
 * `own`, reading `old` instead while `own` has nothing, so an instrument
 * that has just been given an id takes the record it used to share. Writes
 * go only to `own`, so after the first save the old record is never read
 * again, and it's left in place for anything else that still reads it.
 */
export function withFallback(own: Store, old: Store): Store {
  return {
    load: () => {
      const value = own.load();
      if (value !== null && value !== undefined) return value;
      try {
        return old.load() ?? null;
      } catch {
        return null;
      }
    },
    save: (v) => own.save(v),
  };
}

function keyStore(key: string): Store {
  return {
    load: () => JSON.parse(localStorage.getItem(key) ?? "null"),
    save: (v) => localStorage.setItem(key, JSON.stringify(v)),
  };
}
