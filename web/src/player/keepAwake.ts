/**
 * Keeping practice going on a phone.
 *
 * A phone that locks its screen suspends the page's audio (iOS always does;
 * Android often does, depending on battery settings). KeepAwake holds a Screen
 * Wake Lock while the tala or the thambura plays, so the screen doesn't time
 * out mid-practice. It can't stop a press of the power button from locking the
 * phone; on iOS nothing a web page does can keep Web Audio running after that.
 */

/** The part of a WakeLockSentinel we use. */
export interface WakeLockSentinelLike {
  release(): Promise<void>;
  /** Fires when the lock is let go, by us or by the browser (the page was hidden, say). */
  addEventListener(type: "release", cb: () => void): void;
}

/** `navigator.wakeLock`, or a fake. */
export interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

/** `document`, or a fake: just its visibility. */
export interface VisibilityDoc {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", cb: () => void): void;
}

/**
 * Holds the screen awake while any source is playing. Sources are named
 * ("tala", "thambura") and switched with `set`. The browser drops the lock
 * whenever the page is hidden; this takes it again when the page is back in
 * view and something still plays. A refused request (battery saver, say) is
 * ignored until the next change.
 */
export class KeepAwake {
  private readonly playing = new Set<string>();
  private sentinel: WakeLockSentinelLike | null = null;
  private requesting = false;

  constructor(private readonly deps: { wakeLock?: WakeLockLike; doc: VisibilityDoc }) {
    deps.doc.addEventListener("visibilitychange", () => this.sync());
  }

  set(source: string, playing: boolean): void {
    if (playing) this.playing.add(source);
    else this.playing.delete(source);
    this.sync();
  }

  private sync(): void {
    if (this.playing.size === 0) {
      const s = this.sentinel;
      this.sentinel = null;
      s?.release().catch(() => {});
      return;
    }
    // Browsers only grant the lock to a visible page.
    if (this.deps.doc.visibilityState === "visible" && !this.sentinel && !this.requesting) void this.acquire();
  }

  private async acquire(): Promise<void> {
    const lock = this.deps.wakeLock;
    if (!lock) return;
    this.requesting = true;
    let s: WakeLockSentinelLike;
    try {
      s = await lock.request("screen");
    } catch {
      return; // refused; the next set() or visibility change tries again
    } finally {
      this.requesting = false;
    }
    s.addEventListener("release", () => {
      if (this.sentinel === s) this.sentinel = null;
    });
    this.sentinel = s;
    // Playback may have stopped while the request was out.
    this.sync();
  }
}

/**
 * Asks Safari (16.4+) to treat the page's sound as media playback rather than
 * ambient sound, so the iPhone's silent switch doesn't mute it. Other browsers
 * have no `navigator.audioSession` and this does nothing.
 */
export function usePlaybackSession(nav: { audioSession?: { type: string } }): void {
  if (nav.audioSession) nav.audioSession.type = "playback";
}
