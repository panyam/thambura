import { barOpen } from "../engine/shareLink";
import type { ThamburaStore } from "./thamburaPresenter";

export interface ThamburaDrawerDeps {
  /** Where the drawer keeps whether it is open, under its own key. */
  store?: ThamburaStore;
  /**
   * The presenter's old store, which kept `open` beside the settings until
   * #88. Read only when `store` has nothing, so a returning listener's bar
   * opens as they left it.
   */
  legacy?: ThamburaStore;
  /** The share link the page was opened with, whose bar flag wins over the saved state. */
  link?: string | null;
}

/**
 * Whether the thambura's bar is slid up. This belongs to the page's layout,
 * not to the instrument: the presenter holds what the thambura plays, and a
 * layout that docks the thambura has no drawer at all (docs/layouts.md).
 *
 * A shared link's flag wins over the saved state but isn't saved over it
 * until the listener opens or closes the bar, as the presenter does with a
 * link's sound.
 */
export class ThamburaDrawer {
  private isOpen: boolean;
  private listener?: (open: boolean) => void;

  constructor(private readonly deps: ThamburaDrawerDeps) {
    const own = loadSafely(deps.store);
    let saved: boolean;
    if (own === undefined || own === null) {
      saved = (loadSafely(deps.legacy) as { open?: unknown } | null | undefined)?.open === true;
      if (saved) this.save(saved);
    } else {
      saved = (own as { open?: unknown }).open === true;
    }
    this.isOpen = (deps.link ? barOpen(deps.link) : null) ?? saved;
  }

  get open(): boolean {
    return this.isOpen;
  }

  /** Hears every change after construction. One listener; a second replaces the first. */
  onChange(listener: (open: boolean) => void): void {
    this.listener = listener;
  }

  setOpen(open: boolean): void {
    if (open === this.isOpen) return;
    this.isOpen = open;
    this.save(open);
    this.listener?.(open);
  }

  toggle(): void {
    this.setOpen(!this.isOpen);
  }

  private save(open: boolean): void {
    try {
      this.deps.store?.save({ open });
    } catch {
      // Storage can be full or blocked; the bar just won't be remembered.
    }
  }
}

function loadSafely(store: ThamburaStore | undefined): unknown {
  try {
    return store?.load();
  } catch {
    return undefined;
  }
}
