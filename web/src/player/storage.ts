/**
 * Where each part of the app keeps its state in localStorage. Every key goes
 * through here. An instrument keeps its state under its id on the page
 * (`thambura.thambura-1`, `thambura.kit-1`), so two of a kind don't share a
 * record; the named keys below are the page's own, and the old ones read
 * once for a migration (docs/designs/instruments.md).
 */
const KEYS = {
  /** The tala player's choices (presenter.ts). */
  player: "thambura.player",
  /**
   * The one thambura's settings, view and Custom plan before instance ids.
   * `thambura-1` reads it once (see `withFallback`), and the drawer reads its
   * old `open` flag; nothing writes it any more.
   */
  drone: "thambura.drone",
  /** The thambura's saved presets. A preset is a sound, so any thambura can play it. */
  presets: "thambura.presets",
  /** Whether the thambura's bar is open (thamburaDrawer.ts). */
  drawer: "thambura.drawer",
  /** The page's Sa, which every pitched instrument plays to (pageContext.ts, Shruthi). */
  shruthi: "thambura.shruthi",
} as const;

export type StoreName = keyof typeof KEYS;

export function storageKey(name: StoreName): string {
  return KEYS[name];
}

/** A value kept as JSON under `name`'s key. Throws are the caller's to catch, as every presenter does. */
export interface Store {
  load(): unknown;
  save(value: unknown): void;
}

/** Where the instrument with this id on the page keeps its state. */
export function instrumentKey(id: string): string {
  return `thambura.${id}`;
}

export function localStore(name: StoreName): Store {
  return keyStore(storageKey(name));
}

/** The store for the instrument with this id on the page. */
export function instrumentStore(id: string): Store {
  return keyStore(instrumentKey(id));
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
