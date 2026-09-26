/**
 * Where each part of the app keeps its state in localStorage. Every key goes
 * through here, so when the instrument work renames them to carry instance
 * ids (docs/designs/instruments.md), and migrates the old ones, it's one place.
 */
const KEYS = {
  /** The tala player's choices (presenter.ts). */
  player: "thambura.player",
  /** The thambura's settings, view and Custom plan (thamburaPresenter.ts). */
  drone: "thambura.drone",
  /** The thambura's saved presets. */
  presets: "thambura.presets",
  /** Whether the thambura's bar is open (thamburaDrawer.ts). */
  drawer: "thambura.drawer",
  /** A kit's choices, such as Variety (kitPresenter.ts). Shared by every kit for now. */
  kit: "thambura.kit",
  /** The hand claps' Sounds and Volume (handsPresenter.ts). */
  hands: "thambura.hands",
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

export function localStore(name: StoreName): Store {
  const key = storageKey(name);
  return {
    load: () => JSON.parse(localStorage.getItem(key) ?? "null"),
    save: (v) => localStorage.setItem(key, JSON.stringify(v)),
  };
}
