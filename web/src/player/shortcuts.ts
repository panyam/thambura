/** The parts of a keydown the thambura's shortcut looks at. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
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
  const tag = e.target?.tagName?.toUpperCase();
  return !(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable);
}
