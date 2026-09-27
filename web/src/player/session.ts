import { decodeLink, decodeSession, encodeSession } from "../engine/shareLink";
import { clampTempo, DEFAULT_SETTINGS, DEFAULT_TEMPO, type TalaSettings } from "../engine/selection";
import { DEFAULT_PITCH, DEFAULT_THAMBURA, normalizePitch, tunedTonicHz, type Pitch } from "../engine/shruthi";
import type { KitPresenter } from "./kitPresenter";
import { pageShortcut, type KeyPress } from "./shortcuts";
import type { LinkPart } from "./pageLink";
import type { Shruthi } from "./pageContext";
import type { PlayerPresenter } from "./presenter";
import type { ThamburaPresenter } from "./thamburaPresenter";

type ThamburaLike = Pick<ThamburaPresenter, "state" | "watch" | "start" | "stop">;

/** What the session strip shows. */
export interface SessionState {
  /** The tala's speed in bpm, or null when the page has no tala. */
  tempo: number | null;
  pitch: Pitch;
  /** Whether the tala or the thambura is playing, for Start all. */
  playing: boolean;
}

export interface SessionView {
  setState(state: SessionState): void;
}

export interface SessionDeps {
  shruthi: Shruthi;
  tala?: Pick<PlayerPresenter, "state" | "watch" | "setTempo" | "start" | "stop">;
  /** The page's thambura now, if it has one; the track list can add and remove it. */
  thambura?: () => ThamburaLike | undefined;
  /** The page's kits, asked which keys they'd sound stretched in. */
  kits?: () => Pick<KitPresenter, "state" | "stretchedAt">[];
  /** The page link's session part, written with the tala, speed and shruthi on every change. */
  link?: LinkPart;
}

/**
 * What the whole page shares rather than one instrument: the tala's speed,
 * the shruthi, and Start all (#101). It owns none of them. The speed is the
 * tala's, the shruthi the page's Shruthi, and the instruments start and
 * stop themselves; this puts them in one strip and keeps the page link's
 * session part (engine/shareLink.ts) in step with them.
 */
export class SessionPresenter {
  state: SessionState;
  private readonly views: SessionView[] = [];
  private readonly watched = new WeakSet<ThamburaLike>();
  // What the session part was last written from, so a beat's state change doesn't re-encode it.
  private written: [unknown, unknown, unknown] = [null, null, null];

  constructor(private readonly deps: SessionDeps) {
    this.state = this.read();
    deps.tala?.watch(() => this.refresh());
    this.tracksChanged();
    deps.shruthi.follow(() => this.refresh());
    this.writeLink();
  }

  /** Adds a view; the tala's strip and a standalone one can show the same session. */
  /**
   * The page's instruments changed: hears the thambura if there's a new one,
   * and shows whether anything is playing now.
   */
  tracksChanged(): void {
    const thambura = this.deps.thambura?.();
    if (thambura && !this.watched.has(thambura)) {
      this.watched.add(thambura);
      thambura.watch(() => this.refresh());
    }
    this.refresh();
  }

  attach(view: SessionView): void {
    this.views.push(view);
    view.setState(this.state);
  }

  // ---- intents -----------------------------------------------------------

  setTempo(bpm: number): void {
    this.deps.tala?.setTempo(bpm);
  }

  nudgeTempo(delta: number): void {
    if (this.state.tempo !== null) this.setTempo(this.state.tempo + delta);
  }

  setKey(key: number): void {
    this.deps.shruthi.set({ key });
  }

  /** A semitone up or down, as iTanpura's arrows step it. */
  stepKey(delta: number): void {
    this.deps.shruthi.stepKey(delta);
  }

  setCents(cents: number): void {
    this.deps.shruthi.set({ cents });
  }

  nudgeCents(delta: number): void {
    this.deps.shruthi.nudgeCents(delta);
  }

  /** Starts or stops the thambura alone, as the T key does. */
  toggleThambura(): Promise<void> {
    const thambura = this.deps.thambura?.();
    if (!thambura) return Promise.resolve();
    if (thambura.state.playing) {
      thambura.stop();
      return Promise.resolve();
    }
    return thambura.start();
  }

  /** Stops everything if anything is playing, otherwise starts the tala and the thambura together. */
  async toggleAll(): Promise<void> {
    if (this.state.playing) {
      this.deps.tala?.stop();
      this.deps.thambura?.()?.stop();
      return;
    }
    await Promise.all([this.deps.tala?.start(), this.deps.thambura?.()?.start()]);
  }

  /**
   * The names of the instruments that would sound stretched with Sa on
   * `key`, for the shruthi picker's marks. Asked when the picker opens,
   * since a kit loads after the page does.
   */
  stretchedIn(key: number): string[] {
    const hz = tunedTonicHz({ ...this.state.pitch, key });
    return (this.deps.kits?.() ?? []).filter((k) => k.stretchedAt(hz)).map((k) => capitalize(k.state.instrument || "the kit"));
  }

  // ---- internals ---------------------------------------------------------

  private read(): SessionState {
    return {
      tempo: this.deps.tala ? this.deps.tala.state.tempo : null,
      pitch: this.deps.shruthi.pitch,
      playing: !!(this.deps.tala?.state.playing || this.deps.thambura?.()?.state.playing),
    };
  }

  private refresh(): void {
    const next = this.read();
    const s = this.state;
    if (next.tempo !== s.tempo || next.pitch !== s.pitch || next.playing !== s.playing) {
      this.state = next;
      for (const v of this.views) v.setState(next);
    }
    this.writeLink();
  }

  /** Writes the session part when the tala, the speed or the shruthi has changed. */
  private writeLink(): void {
    if (!this.deps.link) return;
    const tala: TalaSettings = this.deps.tala?.state.settings ?? DEFAULT_SETTINGS;
    const tempo = clampTempo(this.deps.tala?.state.tempo ?? DEFAULT_TEMPO);
    const pitch = this.deps.shruthi.pitch;
    const [t, bpm, p] = this.written;
    if (t === tala && bpm === tempo && p === pitch) return;
    this.written = [tala, tempo, pitch];
    this.deps.link.write(encodeSession({ tala, tempo, pitch }));
  }
}

/**
 * The shruthi a page opens on: a shared link's session part; else a shared
 * thambura part's key, as links made before the session part carry it; else
 * what this browser saved; else the saved thambura's key, from before the
 * page had a shruthi of its own; else C.
 */
export function startingPitch(opened: { session: string | null; thambura: string | null }, saved: unknown, savedThambura: unknown): Pitch {
  const session = opened.session && decodeSession(opened.session);
  if (session) return session.pitch;
  const thambura = opened.thambura && decodeLink(opened.thambura, { settings: DEFAULT_THAMBURA });
  if (thambura) return normalizePitch(thambura.settings);
  if (saved && typeof saved === "object") return normalizePitch(saved);
  const settings = (savedThambura as { settings?: unknown } | null)?.settings;
  if (settings && typeof settings === "object") return normalizePitch(settings);
  return DEFAULT_PITCH;
}

/**
 * Takes the page-wide keys (shortcuts.ts, pageShortcut) for the session:
 * Space for Start all, T for the thambura alone, Shift+↑/↓ for the shruthi.
 * Only on our own pages; an embed leaves the host's keys alone.
 */
export function wireSessionKeys(doc: Pick<Document, "addEventListener">, session: SessionPresenter): void {
  doc.addEventListener("keydown", (e) => {
    const action = pageShortcut(e as KeyboardEvent & KeyPress);
    if (!action) return;
    e.preventDefault();
    if (action === "toggleAll") void session.toggleAll();
    else if (action === "thambura") void session.toggleThambura();
    else session.stepKey(action === "shruthiUp" ? 1 : -1);
  });
}

/**
 * The page's floating play button (`#play-all`, HomePage.html): Start all
 * from anywhere on the page, showing whether anything is playing.
 */
export function wireFloatingPlay(button: HTMLElement | null, session: SessionPresenter): void {
  if (!button) return;
  session.attach({
    setState: (s) => {
      button.dataset.playing = String(s.playing);
      button.setAttribute("aria-pressed", String(s.playing));
      button.setAttribute("aria-label", s.playing ? "Stop all" : "Start all");
      button.title = s.playing ? "Stop everything (Space)" : "Start the tala and the thambura (Space)";
    },
  });
  button.addEventListener("click", () => void session.toggleAll());
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
