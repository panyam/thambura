import { describe, expect, it } from "vitest";
import { encodeLink } from "../engine/shareLink";
import { DEFAULT_THAMBURA } from "../engine/shruthi";
import { planFor } from "../engine/thamburaPlan";
import { ThamburaDrawer } from "./thamburaDrawer";

class FakeStore {
  saved: unknown = undefined;
  saves = 0;
  constructor(public initial: unknown = undefined) {}
  load() {
    return this.initial;
  }
  save(v: unknown) {
    this.saved = v;
    this.saves++;
  }
}

const linkWithBar = (open: boolean) =>
  encodeLink({ settings: DEFAULT_THAMBURA, custom: planFor(DEFAULT_THAMBURA), view: "studio", open });

describe("ThamburaDrawer", () => {
  it("starts closed", () => {
    expect(new ThamburaDrawer({}).open).toBe(false);
  });

  it("restores its own saved state, cleaning a bad value", () => {
    expect(new ThamburaDrawer({ store: new FakeStore({ open: true }) }).open).toBe(true);
    expect(new ThamburaDrawer({ store: new FakeStore({ open: "yes" }) }).open).toBe(false);
    expect(new ThamburaDrawer({ store: new FakeStore("junk") }).open).toBe(false);
  });

  it("takes the state the presenter used to save, once", () => {
    const store = new FakeStore(null);
    const legacy = new FakeStore({ settings: {}, view: "lab", open: true });
    const d = new ThamburaDrawer({ store, legacy });
    expect(d.open).toBe(true);
    expect(store.saved).toEqual({ open: true });
    // Its own key wins from then on.
    expect(new ThamburaDrawer({ store: new FakeStore({ open: false }), legacy }).open).toBe(false);
  });

  it("opens as a shared link says, without saving over the listener's own", () => {
    const store = new FakeStore({ open: false });
    const d = new ThamburaDrawer({ store, link: linkWithBar(true) });
    expect(d.open).toBe(true);
    expect(store.saves).toBe(0);
    expect(new ThamburaDrawer({ store: new FakeStore({ open: true }), link: linkWithBar(false) }).open).toBe(false);
    // A link it can't read changes nothing.
    expect(new ThamburaDrawer({ store: new FakeStore({ open: true }), link: "!!" }).open).toBe(true);
  });

  it("saves and tells its listener on every change, and only then", () => {
    const store = new FakeStore();
    const d = new ThamburaDrawer({ store });
    const heard: boolean[] = [];
    d.onChange((open) => heard.push(open));
    d.toggle();
    d.setOpen(true);
    d.setOpen(false);
    expect(heard).toEqual([true, false]);
    expect(store.saved).toEqual({ open: false });
    expect(store.saves).toBe(2);
  });

  it("carries on when storage throws", () => {
    const broken = {
      load: () => {
        throw new Error("blocked");
      },
      save: () => {
        throw new Error("full");
      },
    };
    const d = new ThamburaDrawer({ store: broken, legacy: broken });
    expect(d.open).toBe(false);
    d.toggle();
    expect(d.open).toBe(true);
  });
});
