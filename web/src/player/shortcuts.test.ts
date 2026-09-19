import { describe, expect, it } from "vitest";
import { isThamburaShortcut, type KeyPress } from "./shortcuts";

const press = (patch: Partial<KeyPress> = {}): KeyPress => ({
  key: "t",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  target: { tagName: "BODY" },
  ...patch,
});

describe("the thambura shortcut", () => {
  it("is T, with or without Shift, wherever the page has focus", () => {
    expect(isThamburaShortcut(press())).toBe(true);
    expect(isThamburaShortcut(press({ key: "T" }))).toBe(true);
    expect(isThamburaShortcut(press({ target: { tagName: "BUTTON" } }))).toBe(true);
    expect(isThamburaShortcut(press({ target: null }))).toBe(true);
  });

  it("leaves other keys, and T with Ctrl, Cmd or Alt, to the browser", () => {
    expect(isThamburaShortcut(press({ key: "r" }))).toBe(false);
    expect(isThamburaShortcut(press({ ctrlKey: true }))).toBe(false);
    expect(isThamburaShortcut(press({ metaKey: true }))).toBe(false);
    expect(isThamburaShortcut(press({ altKey: true }))).toBe(false);
  });

  it("does nothing while typing, or while the key is held", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "input"]) expect(isThamburaShortcut(press({ target: { tagName } }))).toBe(false);
    expect(isThamburaShortcut(press({ target: { tagName: "DIV", isContentEditable: true } }))).toBe(false);
    expect(isThamburaShortcut(press({ repeat: true }))).toBe(false);
  });
});
