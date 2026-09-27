/** The parts of a keydown the page's shortcuts look at. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  repeat: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}

/**
 * Whether a keypress is the thambura's start/stop shortcut: T on its own,
 * held or not with Shift, but not while typing in a field, not repeating
 * while held down, and not with Ctrl, Cmd or Alt, which belong to the
 * browser (Cmd-T opens a tab).
 */
export function isThamburaShortcut(e: KeyPress): boolean {
  if (e.key.toLowerCase() !== "t" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  return !typing(e);
}

/** What a page-wide key does: Space starts or stops everything, Shift+↑/↓ steps the shruthi. */
export type PageShortcut = "toggleAll" | "shruthiUp" | "shruthiDown";

/**
 * The page-wide shortcut a keypress is, if any. Never while typing in a
 * field or with Ctrl, Cmd or Alt. Space also leaves a focused button or link
 * alone, since it presses those, and isn't taken while held down; the
 * shruthi steps again while Shift+↑ is held, as the arrows would.
 */
export function pageShortcut(e: KeyPress): PageShortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return null;
  if (e.key === " " && !e.shiftKey && !e.repeat) {
    const tag = e.target?.tagName?.toUpperCase();
    return tag === "BUTTON" || tag === "A" ? null : "toggleAll";
  }
  if (e.shiftKey && e.key === "ArrowUp") return "shruthiUp";
  if (e.shiftKey && e.key === "ArrowDown") return "shruthiDown";
  return null;
}

function typing(e: KeyPress): boolean {
  const tag = e.target?.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!e.target?.isContentEditable;
}
