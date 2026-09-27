import { describe, expect, it } from "vitest";
import { decodeSession, encodeLink, encodeSession } from "../engine/shareLink";
import { DEFAULT_SETTINGS, type TalaSettings } from "../engine/selection";
import { DEFAULT_PITCH, DEFAULT_THAMBURA, KEY_C3, KEY_G3, tunedTonicHz } from "../engine/shruthi";
import { planFor } from "../engine/thamburaPlan";
import { Shruthi } from "./pageContext";
import { SessionPresenter, startingPitch, type SessionState } from "./session";

/** A tala or thambura that starts, stops and tells its watchers, as the presenters do. */
class FakePlayer<S extends { playing: boolean }> {
  private readonly watchers: ((s: S) => void)[] = [];
  constructor(public state: S) {}
  watch(f: (s: S) => void) {
    this.watchers.push(f);
  }
  change(patch: Partial<S>) {
    this.state = { ...this.state, ...patch };
    for (const f of this.watchers) f(this.state);
  }
  async start() {
    this.change({ playing: true } as Partial<S>);
  }
  stop() {
    this.change({ playing: false } as Partial<S>);
  }
  setTempo(bpm: number) {
    this.change({ tempo: bpm } as unknown as Partial<S>);
  }
}

type TalaLike = { playing: boolean; tempo: number; settings: TalaSettings };

function setUp() {
  const shruthi = new Shruthi();
  const tala = new FakePlayer<TalaLike>({ playing: false, tempo: 80, settings: DEFAULT_SETTINGS });
  const thambura = new FakePlayer({ playing: false });
  const writes: string[] = [];
  const session = new SessionPresenter({
    shruthi,
    tala: tala as never,
    thambura: thambura as never,
    link: { read: () => null, write: (l) => writes.push(l) },
  });
  const views: SessionState[] = [];
  session.attach({ setState: (s) => views.push(s) });
  return { shruthi, tala, thambura, session, writes, views };
}

describe("SessionPresenter", () => {
  it("shows the tala's speed and the page's shruthi, and changes them", () => {
    const { shruthi, tala, session, views } = setUp();
    expect(session.state).toEqual({ tempo: 80, pitch: DEFAULT_PITCH, playing: false });
    session.nudgeTempo(4);
    expect(tala.state.tempo).toBe(84);
    session.stepKey(1);
    session.nudgeCents(-3);
    expect(shruthi.pitch).toEqual({ ...DEFAULT_PITCH, key: DEFAULT_PITCH.key + 1, cents: -3 });
    expect(views.at(-1)).toEqual({ tempo: 84, pitch: shruthi.pitch, playing: false });
  });

  it("starts the tala and the thambura together, and stops both if either plays", async () => {
    const { tala, thambura, session } = setUp();
    await session.toggleAll();
    expect([tala.state.playing, thambura.state.playing]).toEqual([true, true]);
    await session.toggleAll();
    expect([tala.state.playing, thambura.state.playing]).toEqual([false, false]);
    await thambura.start();
    expect(session.state.playing).toBe(true);
    await session.toggleAll();
    expect([tala.state.playing, thambura.state.playing]).toEqual([false, false]);
  });

  it("writes the session part at once and on each change, not on every beat", async () => {
    const { tala, session, writes } = setUp();
    expect(writes.map((w) => decodeSession(w))).toEqual([{ tala: DEFAULT_SETTINGS, tempo: 80, pitch: DEFAULT_PITCH }]);
    await session.toggleAll();
    tala.change({ playing: true });
    expect(writes).toHaveLength(1);
    session.setTempo(96);
    session.setKey(KEY_G3);
    expect(writes.slice(1).map((w) => decodeSession(w))).toEqual([
      { tala: DEFAULT_SETTINGS, tempo: 96, pitch: DEFAULT_PITCH },
      { tala: DEFAULT_SETTINGS, tempo: 96, pitch: { ...DEFAULT_PITCH, key: KEY_G3 } },
    ]);
  });

  it("has no speed without a tala, and names the kits a key would stretch", () => {
    const shruthi = new Shruthi();
    const g3 = tunedTonicHz({ ...DEFAULT_PITCH, key: KEY_G3 });
    const kit = { state: { instrument: "mridangam" }, stretchedAt: (hz: number) => hz === g3 };
    const session = new SessionPresenter({ shruthi, kits: () => [kit as never] });
    expect(session.state.tempo).toBeNull();
    expect(session.stretchedIn(KEY_G3)).toEqual(["Mridangam"]);
    expect(session.stretchedIn(KEY_C3)).toEqual([]);
  });
});

describe("startingPitch", () => {
  const thamburaLink = encodeLink({ settings: { ...DEFAULT_THAMBURA, key: 5, cents: 7 }, custom: planFor(DEFAULT_THAMBURA), view: "studio" });
  const sessionPart = encodeSession({ tala: DEFAULT_SETTINGS, tempo: 80, pitch: { key: 9, cents: -4, a4: 442 } });
  const saved = { key: 11, cents: 2, a4: 440 };
  const savedThambura = { settings: { ...DEFAULT_THAMBURA, key: 13 } };

  it("takes a shared session, then a shared thambura, then this browser's shruthi, then its thambura's", () => {
    expect(startingPitch({ session: sessionPart, thambura: thamburaLink }, saved, savedThambura)).toEqual({ key: 9, cents: -4, a4: 442 });
    expect(startingPitch({ session: null, thambura: thamburaLink }, saved, savedThambura)).toEqual({ key: 5, cents: 7, a4: 440 });
    expect(startingPitch({ session: null, thambura: null }, saved, savedThambura)).toEqual(saved);
    expect(startingPitch({ session: null, thambura: null }, null, savedThambura)).toEqual({ key: 13, cents: 0, a4: 440 });
    expect(startingPitch({ session: "junk", thambura: null }, null, null)).toEqual(DEFAULT_PITCH);
  });
});
