import { describe, expect, it } from "vitest";
import { isThamburaShortcut, pageShortcut, type KeyPress } from "./shortcuts";

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

describe("the page's shortcuts", () => {
  it("are Space for Start all and Shift+↑/↓ for the shruthi", () => {
    expect(pageShortcut(press({ key: " " }))).toBe("toggleAll");
    expect(pageShortcut(press({ key: "ArrowUp", shiftKey: true }))).toBe("shruthiUp");
    expect(pageShortcut(press({ key: "ArrowDown", shiftKey: true, repeat: true }))).toBe("shruthiDown");
    expect(pageShortcut(press({ key: "ArrowUp" }))).toBeNull();
    expect(pageShortcut(press({ key: "r" }))).toBeNull();
  });

  it("include T for the thambura alone, on the same terms as before", () => {
    expect(pageShortcut(press())).toBe("thambura");
    expect(pageShortcut(press({ key: "T", shiftKey: true }))).toBe("thambura");
    expect(pageShortcut(press({ repeat: true }))).toBeNull();
    expect(pageShortcut(press({ metaKey: true }))).toBeNull();
    expect(pageShortcut(press({ target: { tagName: "INPUT" } }))).toBeNull();
  });

  it("leave typing, the browser's modifiers, a held Space and a focused button alone", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(pageShortcut(press({ key: " ", target: { tagName } }))).toBeNull();
      expect(pageShortcut(press({ key: "ArrowUp", shiftKey: true, target: { tagName } }))).toBeNull();
    }
    expect(pageShortcut(press({ key: " ", target: { tagName: "BUTTON" } }))).toBeNull();
    expect(pageShortcut(press({ key: " ", target: { tagName: "A" } }))).toBeNull();
    expect(pageShortcut(press({ key: " ", repeat: true }))).toBeNull();
    expect(pageShortcut(press({ key: " ", ctrlKey: true }))).toBeNull();
    expect(pageShortcut(press({ key: "ArrowUp", shiftKey: true, metaKey: true }))).toBeNull();
  });
});
