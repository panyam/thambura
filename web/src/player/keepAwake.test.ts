import { beforeEach, describe, expect, it } from "vitest";
import { KeepAwake, usePlaybackSession, type WakeLockSentinelLike } from "./keepAwake";

class FakeSentinel implements WakeLockSentinelLike {
  released = false;
  private onRelease: (() => void) | null = null;
  async release() {
    this.released = true;
    this.onRelease?.();
  }
  addEventListener(_type: "release", cb: () => void) {
    this.onRelease = cb;
  }
  /** What the browser does when the page is hidden. */
  systemRelease() {
    this.released = true;
    this.onRelease?.();
  }
}

class FakeWakeLock {
  sentinels: FakeSentinel[] = [];
  fail = false;
  async request(_type: "screen") {
    if (this.fail) throw new Error("NotAllowedError");
    const s = new FakeSentinel();
    this.sentinels.push(s);
    return s;
  }
  get held() {
    return this.sentinels.filter((s) => !s.released).length;
  }
}

class FakeDoc {
  visibilityState: DocumentVisibilityState = "visible";
  private cb: (() => void) | null = null;
  addEventListener(_type: "visibilitychange", cb: () => void) {
    this.cb = cb;
  }
  show(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.cb?.();
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("KeepAwake", () => {
  let lock: FakeWakeLock;
  let doc: FakeDoc;
  let k: KeepAwake;

  beforeEach(() => {
    lock = new FakeWakeLock();
    doc = new FakeDoc();
    k = new KeepAwake({ wakeLock: lock, doc });
  });

  it("holds the screen awake while anything plays", async () => {
    k.set("tala", true);
    await settle();
    expect(lock.held).toBe(1);
    k.set("thambura", true);
    await settle();
    expect(lock.held).toBe(1);
    k.set("tala", false);
    await settle();
    expect(lock.held).toBe(1);
    k.set("thambura", false);
    await settle();
    expect(lock.held).toBe(0);
  });

  it("takes the lock again when the page comes back into view", async () => {
    k.set("thambura", true);
    await settle();
    doc.show("hidden");
    lock.sentinels[0].systemRelease();
    doc.show("visible");
    await settle();
    expect(lock.sentinels).toHaveLength(2);
    expect(lock.held).toBe(1);
  });

  it("doesn't take it back when nothing is playing", async () => {
    k.set("tala", true);
    await settle();
    k.set("tala", false);
    await settle();
    doc.show("hidden");
    doc.show("visible");
    await settle();
    expect(lock.sentinels).toHaveLength(1);
  });

  it("releases a lock that arrives after playback already stopped", async () => {
    k.set("tala", true);
    k.set("tala", false);
    await settle();
    expect(lock.held).toBe(0);
  });

  it("waits for the page to be visible before asking", async () => {
    doc.visibilityState = "hidden";
    k.set("tala", true);
    await settle();
    expect(lock.sentinels).toHaveLength(0);
    doc.show("visible");
    await settle();
    expect(lock.held).toBe(1);
  });

  it("carries on quietly when the lock is refused or unsupported", async () => {
    lock.fail = true;
    k.set("tala", true);
    await settle();
    expect(lock.held).toBe(0);
    const none = new KeepAwake({ wakeLock: undefined, doc });
    expect(() => none.set("tala", true)).not.toThrow();
  });
});

describe("usePlaybackSession", () => {
  it("sets Safari's audio session to playback, so the silent switch doesn't mute it", () => {
    const nav = { audioSession: { type: "auto" } };
    usePlaybackSession(nav);
    expect(nav.audioSession.type).toBe("playback");
  });

  it("does nothing where there is no audio session API", () => {
    expect(() => usePlaybackSession({})).not.toThrow();
  });
});
