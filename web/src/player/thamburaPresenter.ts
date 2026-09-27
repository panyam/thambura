import {
  DEFAULT_THAMBURA,
  nextRaaginiString,
  normalizeThambura,
  srutiFrequencies,
  stringFrequencies,
  MAX_CENTS,
  samePitch,
  type Pitch,
  type ThamburaSettings,
} from "../engine/shruthi";
import { reedSpectrum } from "../engine/tambura";
import { BUILT_IN_PRESETS } from "../engine/presets";
import { decodeLink, encodeLink } from "../engine/shareLink";
import { normalizePlan, patternOf, planFor, type ThamburaPlan } from "../engine/thamburaPlan";
import { ThamburaSequencer, type DampEvent, type PluckEvent, type ThamburaTiming } from "../engine/thamburaSequencer";
import type { AudioOut, PlayOptions, ToneHandle, TrackId } from "./audio";
import { SlicedRenderer, type Defer, type PluckRenderer } from "./pluckRenderer";
import type { FrameLoop } from "./presenter";
import { Transport, type Ticker } from "./transport";

export type ThamburaViewId = "mini" | "studio" | "raagini" | "lab";

/** The views the bar's switch offers, in order. */
export const THAMBURA_VIEWS: { id: ThamburaViewId; label: string }[] = [
  { id: "mini", label: "Mini" },
  { id: "studio", label: "Studio" },
  { id: "raagini", label: "Raagini" },
  { id: "lab", label: "Lab" },
];

export interface ThamburaState {
  settings: ThamburaSettings;
  playing: boolean;
  view: ThamburaViewId;
  /** The plan the Custom mode plays, edited in the Lab view. */
  custom: ThamburaPlan;
  /** The plan being played, whatever the mode. The Lab shows and edits this. */
  plan: ThamburaPlan;
  /** The preset the sound came from, if any, and whether it has been changed since. */
  presetId: string | null;
  edited: boolean;
  /** A note for the listener about the link they opened, until dismissed. */
  notice: string | null;
  /** Setups saved by name, newest first. */
  presets: ThamburaPreset[];
  /**
   * Strings silenced in the Lab, to hear the others alone. A listening aid,
   * not part of the sound: left out of links and presets, and cleared on
   * leaving the Lab.
   */
  muted: [boolean, boolean, boolean, boolean];
  /** Strings whose pluck was heard a moment ago, for the glow and the LEDs. */
  lit: [boolean, boolean, boolean, boolean];
}

export interface ThamburaView {
  setState(state: ThamburaState): void;
}

/** Where the settings and view are kept between visits. */
export interface ThamburaStore {
  load(): unknown;
  save(value: unknown): void;
}

/**
 * A setup saved by name: its share link (engine/shareLink.ts), which holds the
 * sound, so a preset is also something to send. `auto` marks the one kept
 * when a shared link replaced the listener's own setup.
 */
export interface ThamburaPreset {
  id: string;
  name: string;
  link: string;
  auto?: boolean;
}

/** The name of the preset that keeps a listener's setup when they open someone's link. */
export const BEFORE_LINK_PRESET = "Before shared link";
// Presets kept, most recent first. Each is a few dozen bytes.
const MAX_PRESETS = 200;

/**
 * The shareable link in the address bar (engine/shareLink.ts). `read` gives
 * the link the page was opened with, if any; `write` is called with the
 * current setup after every change.
 */
export interface ThamburaLink {
  read(): string | null;
  write(link: string): void;
}

export interface ThamburaDeps {
  /**
   * Its id on the page (`thambura-1`), which is also the audio track it plays
   * on, so two thamburas have their own levels and never choke each other.
   */
  id: TrackId;
  audio: AudioOut;
  ticker: Ticker;
  frames: FrameLoop;
  /**
   * Runs `cb` after `ms`, outside the current call, and returns a cancel.
   * A render waits there for a change to settle, and without `renderer` the
   * plucks are rendered there a slice at a time.
   */
  defer: Defer;
  /** Renders the plucks; by default on the main thread, in slices on `defer`. */
  renderer?: PluckRenderer;
  store?: ThamburaStore;
  /** Where presets are kept, apart from the settings so neither can spoil the other. */
  presets?: ThamburaStore;
  link?: ThamburaLink;
  /**
   * The page's Sa (pageContext.ts, Shruthi). Given one, the thambura plays
   * to it, whatever its own saved settings or link say, and moves it when
   * its own key, fine tune or A4 changes; a preset keeps it.
   */
  shruthi?: PitchSource;
  rng?: () => number;
}

/** A pitch the page shares, which the thambura follows and moves. */
export interface PitchSource {
  readonly pitch: Pitch;
  set(patch: Partial<Pitch>): void;
  follow(f: (pitch: Pitch) => void): () => void;
}

// After a settings change, rendering waits until nothing has changed for this
// long, so a knob turned through several keys renders only the one it stops
// on. Start doesn't wait.
const RENDER_SETTLE_MS = 100;
/** How long a damped string takes to fall silent, in seconds: a finger, not a click. */
export const DAMP_FADE = 0.2;
// How long the strings take to fade after Stop, in seconds.
const STOP_FADE = 1.5;
// Loudness and stereo place of the sruti drone's three tones: the first
// string's swara below Sa, Sa, upper Sa. The swara leads (it is lower, so it
// needs more level to be heard as loud) and sits apart from the two Sa's,
// which otherwise blend into one note.
const SRUTI_GAIN = [0.4, 0.25, 0.08];
const SRUTI_PAN = [-0.35, 0.2, 0.3];
// How long a string stays lit after its pluck is heard, in seconds.
const GLOW = 0.3;

const DARK: ThamburaState["lit"] = [false, false, false, false];
const NONE_MUTED: ThamburaState["muted"] = [false, false, false, false];
// How fast a muted string's ringing note fades, in seconds.
const MUTE_FADE = 0.15;
const VIEW_IDS = THAMBURA_VIEWS.map((v) => v.id);

/**
 * Runs the thambura: settings, the plucked (tambura) and reed (sruti) voices
 * on the drone bus, and the floating bar's state. Any number of views can
 * render its state; they all call the same intents. It has its own Transport,
 * so it starts and stops apart from the tala, sharing only the audio clock.
 */
export class ThamburaPresenter {
  state: ThamburaState;
  private view: ThamburaView | null = null;
  private readonly watchers: ((state: ThamburaState) => void)[] = [];
  private unfollow: (() => void) | undefined;
  private readonly timing: ThamburaTiming;
  private readonly transport: Transport;
  private readonly seq: ThamburaSequencer;
  // Set while a sound change waits for its render before the round restarts.
  private restartWhenReady = false;
  private tones: ToneHandle[] = [];
  // Sample keys the four strings play, every key added to the audio cache,
  // and whether the strings' samples are out of date.
  private stringKeys: string[] = [];
  private readonly rendered = new Set<string>();
  private stale = true;
  private readonly renderer: PluckRenderer;
  // Renders in flight, by sample key, and the wait for a change to settle.
  private readonly pending = new Map<string, { cancel: () => void }>();
  private settling: (() => void) | null = null;
  // Whether the transport should start once every string has its samples.
  private startWhenReady = false;
  // Plucks waiting to be heard, in time order, and when each string goes dark.
  private cues: { time: number; string: number }[] = [];
  private litUntil = [-Infinity, -Infinity, -Infinity, -Infinity];
  private frameId: number | null = null;

  constructor(private readonly deps: ThamburaDeps) {
    this.renderer = deps.renderer ?? new SlicedRenderer(deps.defer);
    const saved = (loadSafely(deps.store) ?? {}) as Record<string, unknown>;
    let settings = normalizeThambura(saved.settings, DEFAULT_THAMBURA);
    let custom = normalizePlan(saved.custom, planFor({ ...settings, mode: "jawari" }));
    let view: ThamburaViewId = VIEW_IDS.includes(saved.view as ThamburaViewId) ? (saved.view as ThamburaViewId) : "studio";
    let notice: string | null = null;
    let presets = normalizePresets(loadSafely(deps.presets));
    // A shared link wins over what this browser saved.
    const link = deps.link?.read();
    if (link) {
      const shared = decodeLink(link, { settings });
      if (shared) {
        // Keep the listener's own setup, if they had one and the link changes it.
        const own = encodeLink({ settings, custom, view });
        if (saved.settings && soundOf(own) !== soundOf(link)) {
          presets = [{ id: presetId(), name: BEFORE_LINK_PRESET, link: own, auto: true }, ...presets.filter((p) => !p.auto)];
        }
        ({ settings, view } = shared);
        custom = shared.custom ?? custom;
        notice = shared.drifted
          ? "Opened a shared setup. Its Custom sound was made from an older version of a built-in sound, so it may sound a little different."
          : "Opened a shared setup.";
      } else {
        notice = "The link in the address bar isn't one this version can read, so your own setup is playing.";
      }
    }
    if (deps.shruthi) settings = { ...settings, ...deps.shruthi.pitch };
    this.state = {
      settings,
      playing: false,
      view,
      custom,
      plan: planFor(settings, custom),
      presetId: null,
      edited: false,
      notice,
      presets,
      muted: NONE_MUTED,
      lit: DARK,
    };
    this.timing = { cycleSeconds: settings.cycleSeconds, pattern: patternOf(this.plan()) };
    this.seq = new ThamburaSequencer(this.timing, deps.rng);
    this.transport = new Transport(deps.audio, deps.ticker);
    this.transport.add(this.seq, (e) => ("damp" in e ? this.damp(e) : this.pluck(e)));
    deps.audio.setBusVolume(deps.id, this.state.settings.volume);
    // The address bar shows the current setup from the start. A shared one
    // isn't saved over this browser's own until the listener changes something.
    deps.link?.write(this.shareLink());
    this.savePresets();
    this.unfollow = deps.shruthi?.follow((pitch) => {
      if (!samePitch(pitch, this.state.settings)) this.set(pitch);
    });
  }

  /** Its id on the page, and the audio track it plays on. */
  get id(): TrackId {
    return this.deps.id;
  }

  attach(view: ThamburaView): void {
    this.view = view;
    view.setState(this.state);
  }

  /** Hears every state change, as the view does; the session strip reads whether it's playing. */
  watch(f: (state: ThamburaState) => void): void {
    this.watchers.push(f);
  }

  // ---- intents -----------------------------------------------------------

  toggle(): Promise<void> {
    if (this.state.playing) {
      this.stop();
      return Promise.resolve();
    }
    return this.start();
  }

  async start(): Promise<void> {
    if (this.state.playing) return;
    await this.deps.audio.unlock();
    this.update({ playing: true });
    this.startVoice();
  }

  stop(): void {
    if (!this.state.playing) return;
    this.stopVoice();
    this.update({ playing: false });
  }

  /**
   * Changes any settings. Values are clamped to their ranges. Pitch and timbre
   * changes re-render the plucks shortly after; fine tune, speed and volume
   * apply at once.
   */
  set(patch: Partial<ThamburaSettings>): void {
    const prev = this.state.settings;
    const next = normalizeThambura({ ...prev, ...patch }, prev);
    this.apply(next, this.state.custom);
  }

  /**
   * Replaces the plan being played (clamped to the Lab's ranges) and switches
   * to Custom, so an edit is always an edit of what's being heard, whichever
   * mode it started from. While playing, the round restarts from the first
   * string still on, so the change is heard at once rather than a round later.
   */
  setCustom(plan: ThamburaPlan): void {
    const custom = normalizePlan(plan, this.state.plan);
    this.apply({ ...this.state.settings, mode: "custom" }, custom);
    this.audition();
  }

  /** Starts the Custom plan from another plucked mode's, which sounds the same until edited. */
  loadCustom(from: ThamburaSettings["mode"]): void {
    this.setCustom(planFor({ ...this.state.settings, mode: from }, this.state.custom));
  }

  private apply(next: ThamburaSettings, custom: ThamburaPlan): void {
    const prev = this.state.settings;
    const prevKeys = sampleKeys(prev, planFor(prev, this.state.custom));
    this.update({ settings: next, custom });
    this.save();

    if (!samePitch(next, prev)) this.deps.shruthi?.set({ key: next.key, cents: next.cents, a4: next.a4 });

    const plan = this.plan();
    if (next.volume !== prev.volume) this.deps.audio.setBusVolume(this.deps.id, next.volume);
    this.timing.cycleSeconds = next.cycleSeconds;
    this.timing.pattern = patternOf(plan);

    if (sampleKeys(next, plan).join() !== prevKeys.join()) this.invalidate();

    if (!this.state.playing) return;
    if (isPlucked(next.mode) !== isPlucked(prev.mode)) {
      this.stopVoice(prev.mode);
      this.startVoice();
    } else if (next.mode === "sruti") {
      this.retuneTones(next.tone !== prev.tone);
    }
  }

  /** Fine tune by `delta` cents, stopping at ±50. */
  nudgeCents(delta: number): void {
    this.set({ cents: Math.max(-MAX_CENTS, Math.min(MAX_CENTS, this.state.settings.cents + delta)) });
  }

  /** Pa, Ma, Ni, Sa in turn, as a Raagini's Select button does. */
  cycleFirstString(): void {
    this.set({ firstString: nextRaaginiString(this.state.settings.firstString) });
  }

  setView(view: ThamburaViewId): void {
    this.update(view === "lab" ? { view } : { view, muted: NONE_MUTED });
    this.save();
  }

  /** Silences or restores one string. A string still ringing fades out, as a stopped string does. */
  setMuted(string: number, muted: boolean): void {
    const next = [...this.state.muted] as ThamburaState["muted"];
    next[string] = muted;
    this.setMutes(next);
  }

  /** Plays only `string`; if it is already the only one playing, brings the others back. */
  solo(string: number): void {
    const alone = this.state.muted.every((m, i) => m === (i !== string));
    this.setMutes(alone ? NONE_MUTED : (NONE_MUTED.map((_, i) => i !== string) as ThamburaState["muted"]));
  }

  dismissNotice(): void {
    this.update({ notice: null });
  }

  /** Saves the current sound as a new preset, newest first. A blank name gets a numbered one. */
  savePreset(name: string): ThamburaPreset {
    const preset = { id: presetId(), name: name.trim() || `Preset ${this.state.presets.length + 1}`, link: this.shareLink() };
    this.update({ presets: [preset, ...this.state.presets].slice(0, MAX_PRESETS), presetId: preset.id, edited: false });
    this.savePresets();
    return preset;
  }

  /**
   * Writes the current sound over the preset it came from. Nothing happens
   * without one, so a built-in sound or an unsaved one needs `savePreset`.
   */
  updatePreset(): ThamburaPreset | null {
    const id = this.state.presetId;
    const preset = this.state.presets.find((p) => p.id === id);
    if (!preset) return null;
    const updated = { ...preset, link: this.shareLink(), auto: undefined };
    this.update({ presets: this.state.presets.map((p) => (p.id === id ? updated : p)), edited: false });
    this.savePresets();
    return updated;
  }

  /**
   * Plays a preset's sound: every setting but the volume (and the pitch,
   * when the page shares one), and its Custom plan if it has one. The view and the bar stay as they are, and a notice
   * about an opened link goes, since it no longer describes what's playing.
   */
  applyPreset(id: string): void {
    const preset = this.preset(id);
    const shared = preset && decodeLink(preset.link, { settings: this.state.settings });
    if (!shared) return;
    this.update({ notice: null });
    const pitch = this.deps.shruthi?.pitch ?? {};
    this.apply({ ...shared.settings, ...pitch }, shared.custom ?? this.state.custom);
    this.update({ presetId: id, edited: false });
    this.audition();
  }

  renamePreset(id: string, name: string): void {
    if (!name.trim()) return;
    this.update({ presets: this.state.presets.map((p) => (p.id === id ? { ...p, name: name.trim(), auto: undefined } : p)) });
    this.savePresets();
  }

  deletePreset(id: string): void {
    this.update({
      presets: this.state.presets.filter((p) => p.id !== id),
      ...(this.state.presetId === id && { presetId: null }),
    });
    this.savePresets();
  }

  /** Plays a built-in sound, as the Presets menu's first group offers. */
  playMode(mode: ThamburaSettings["mode"]): void {
    this.update({ presetId: null, edited: false });
    this.set({ mode });
    this.audition();
  }

  /**
   * Leaves the page: stops, drops its rendered plucks and its audio track.
   * For the track list's Remove; it can't be used afterwards.
   */
  dispose(): void {
    this.stop();
    this.transport.stop();
    for (const entry of this.pending.values()) entry.cancel();
    this.pending.clear();
    this.settling?.();
    this.settling = null;
    this.startWhenReady = false;
    this.restartWhenReady = false;
    for (const key of this.rendered) this.deps.audio.dropSamples(key);
    this.rendered.clear();
    if (this.frameId !== null) this.deps.frames.cancel(this.frameId);
    this.frameId = null;
    this.deps.audio.removeTrack(this.deps.id);
    this.unfollow?.();
  }

  /** The current setup as a link's `s` parameter (engine/shareLink.ts). */
  shareLink(): string {
    return this.linkFor(this.state);
  }

  // ---- internals ---------------------------------------------------------

  private startVoice(): void {
    if (this.state.settings.mode === "sruti") {
      this.startTones();
    } else if (this.stale) {
      // Rendering takes a moment; the first pluck waits for it.
      this.startWhenReady = true;
      this.renderNow();
    } else {
      this.startPlucking();
    }
  }

  private startPlucking(): void {
    this.transport.start();
    this.runFrames();
  }

  private stopVoice(mode = this.state.settings.mode): void {
    if (mode === "sruti") {
      for (const t of this.tones) t.stop();
      this.tones = [];
      return;
    }
    this.startWhenReady = false;
    this.transport.stop();
    this.deps.audio.cancel(this.deps.id);
    this.deps.audio.release(this.deps.id, STOP_FADE);
    this.cues = [];
  }

  private startTones(): void {
    const s = this.state.settings;
    const spectrum = reedSpectrum(s.tone);
    this.tones = srutiFrequencies(s).map((frequency, i) =>
      this.deps.audio.startTone(this.deps.id, { frequency, detune: s.cents, gain: SRUTI_GAIN[i], pan: SRUTI_PAN[i], spectrum }),
    );
  }

  private retuneTones(toneChanged: boolean): void {
    const s = this.state.settings;
    const spectrum = toneChanged ? reedSpectrum(s.tone) : undefined;
    srutiFrequencies(s).forEach((frequency, i) => this.tones[i]?.set({ frequency, detune: s.cents, spectrum }));
  }

  /**
   * Marks the plucks stale and cancels renders the change made useless;
   * while plucking, starts re-rendering once the changes settle.
   */
  private invalidate(): void {
    this.stale = true;
    this.cancelUnneeded(this.keys());
    if (this.state.playing && isPlucked(this.state.settings.mode)) this.renderSoon();
  }

  /** Renders once nothing has changed for RENDER_SETTLE_MS; each call restarts the wait. */
  private renderSoon(): void {
    this.settling?.();
    this.settling = this.deps.defer(() => {
      this.settling = null;
      this.renderMissing();
    }, RENDER_SETTLE_MS);
  }

  private renderNow(): void {
    this.settling?.();
    this.settling = null;
    this.renderMissing();
  }

  private keys(): string[] {
    return sampleKeys(this.state.settings, this.plan());
  }

  private cancelUnneeded(keys: string[]): void {
    for (const [key, job] of this.pending) {
      if (keys.includes(key)) continue;
      job.cancel();
      this.pending.delete(key);
    }
  }

  /**
   * Asks for every pluck the strings need that isn't rendered or on its
   * way, all at once. The strings keep their old samples until every new
   * one has arrived.
   */
  private renderMissing(): void {
    const s = this.state.settings;
    const plan = this.plan();
    const keys = this.keys();
    const hz = stringFrequencies(s);
    this.cancelUnneeded(keys);
    keys.forEach((key, i) => {
      if (this.rendered.has(key) || this.pending.has(key)) return;
      const job = { hz: hz[i], sampleRate: this.deps.audio.sampleRate, voice: plan.strings[i].voice, seed: i + 1 };
      const entry = { cancel: () => {} };
      this.pending.set(key, entry);
      entry.cancel = this.renderer.render(job, (samples) => {
        if (this.pending.get(key) !== entry) return;
        this.pending.delete(key);
        this.deps.audio.addSamples(key, samples);
        this.rendered.add(key);
        this.switchIfReady();
      });
    });
    this.switchIfReady();
  }

  /**
   * Once every string's sample is in, switches the strings over to them,
   * drops samples no string uses, and starts or restarts the round if one
   * was waiting for them.
   */
  private switchIfReady(): void {
    if (!this.stale) return;
    const keys = this.keys();
    if (!keys.every((k) => this.rendered.has(k))) return;
    for (const key of this.rendered) {
      if (keys.includes(key)) continue;
      this.deps.audio.dropSamples(key);
      this.rendered.delete(key);
    }
    this.stringKeys = keys;
    this.stale = false;
    if (this.startWhenReady) {
      this.startWhenReady = false;
      this.restartWhenReady = false;
      this.startPlucking();
    } else if (this.restartWhenReady) {
      this.restartWhenReady = false;
      this.restartRound();
    }
  }

  /**
   * Hears a sound change now: once the strings have their samples, the round
   * restarts from the first string that isn't muted, so an edit doesn't wait
   * for that string's turn (up to a whole round) while its old note rings on.
   */
  private audition(): void {
    if (!this.state.playing || !isPlucked(this.state.settings.mode)) return;
    if (this.stale) {
      this.restartWhenReady = true;
      this.renderSoon();
    } else {
      this.restartRound();
    }
  }

  private restartRound(): void {
    const from = this.state.muted.findIndex((m) => !m);
    if (from < 0) return;
    this.seq.startWith(from);
    // Drop what was booked but not yet heard; ringing strings are choked as they're replucked.
    this.deps.audio.cancel(this.deps.id);
    this.cues = [];
    this.transport.start();
    this.runFrames();
  }

  private setMutes(muted: ThamburaState["muted"]): void {
    muted.forEach((m, i) => {
      if (m && !this.state.muted[i]) this.deps.audio.damp(this.deps.id, `thambura/string${i}`, this.deps.audio.now, MUTE_FADE);
    });
    this.update({ muted });
  }

  private pluck(e: PluckEvent): void {
    if (this.state.muted[e.string]) return;
    this.deps.audio.play(this.stringKeys[e.string], this.deps.id, e.time, pluckOptions(this.plan(), this.state.settings.cents, e));
    this.cues.push({ time: e.time, string: e.string });
  }

  private damp(e: DampEvent): void {
    this.deps.audio.damp(this.deps.id, `thambura/string${e.string}`, e.time, DAMP_FADE);
  }

  /** Lights each string once its pluck is heard; runs while there is anything to show. */
  private runFrames(): void {
    if (this.frameId !== null) return;
    const frame = () => {
      this.frameId = null;
      const heard = this.deps.audio.heardNow;
      while (this.cues.length > 0 && this.cues[0].time <= heard) {
        const cue = this.cues.shift()!;
        this.litUntil[cue.string] = cue.time + GLOW;
      }
      const lit = this.litUntil.map((until) => heard < until) as ThamburaState["lit"];
      if (lit.some((on, i) => on !== this.state.lit[i])) this.update({ lit });
      const busy = this.state.playing || this.cues.length > 0 || lit.some(Boolean);
      if (busy) this.frameId = this.deps.frames.request(frame);
    };
    this.frameId = this.deps.frames.request(frame);
  }

  private plan(): ThamburaPlan {
    return planFor(this.state.settings, this.state.custom);
  }

  private save(): void {
    const { settings, view, custom } = this.state;
    try {
      this.deps.store?.save({ settings, view, custom });
    } catch {
      // Storage can be full or blocked; the settings just won't be remembered.
    }
    this.deps.link?.write(this.shareLink());
  }

  /** A saved preset or one that ships with the app. */
  private preset(id: string | null): ThamburaPreset | undefined {
    return this.state.presets.find((p) => p.id === id) ?? BUILT_IN_PRESETS.find((p) => p.id === id);
  }

  private savePresets(): void {
    try {
      this.deps.presets?.save(this.state.presets);
    } catch {
      // As with the settings: they just won't be remembered.
    }
  }

  private update(patch: Partial<ThamburaState>): void {
    const next = { ...this.state, ...patch };
    if (patch.settings || patch.custom) {
      next.plan = planFor(next.settings, next.custom);
      // A preset's sound is its own until something changes it.
      const from = next.presets.find((p) => p.id === next.presetId) ?? BUILT_IN_PRESETS.find((p) => p.id === next.presetId);
      next.edited = from ? soundOf(this.linkFor(next)) !== soundOf(from.link) : false;
    }
    this.state = next;
    this.view?.setState(this.state);
    for (const f of this.watchers) f(this.state);
  }

  private linkFor(s: ThamburaState): string {
    return encodeLink({ settings: s.settings, custom: s.custom, view: s.view });
  }
}

function isPlucked(mode: ThamburaSettings["mode"]): boolean {
  return mode !== "sruti";
}

/**
 * The sample each string plays: its pitch plus everything that shapes the
 * pluck. Two settings with the same keys can share samples; sruti mode keys
 * like tambura, so switching to it and back re-renders nothing.
 */
function sampleKeys(s: ThamburaSettings, plan: ThamburaPlan): string[] {
  return stringFrequencies(s).map((hz, i) => {
    const voice = Object.values(plan.strings[i].voice)
      .map((v) => v.toFixed(3))
      .join("/");
    return `thambura/${hz.toFixed(3)}/${voice}`;
  });
}

/**
 * How a pluck plays: fine tune plus the string's detune, its level and
 * stereo place, and its choke group. Exported for tools/thamburaMix, which
 * renders the drone offline.
 */
export function pluckOptions(plan: ThamburaPlan, cents: number, e: PluckEvent): PlayOptions {
  const p = plan.strings[e.string];
  return { detune: cents + p.detune, gain: e.gain * p.level, pan: p.pan, choke: `thambura/string${e.string}` };
}

/** Saved presets made safe: well-formed entries only, at most MAX_PRESETS. */
function normalizePresets(raw: unknown): ThamburaPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is ThamburaPreset => !!p && typeof p.id === "string" && typeof p.name === "string" && typeof p.link === "string")
    .map((p) => ({ id: p.id, name: p.name, link: p.link, ...(p.auto === true && { auto: true }) }))
    .slice(0, MAX_PRESETS);
}

let presetCount = 0;
function presetId(): string {
  return `${Date.now().toString(36)}-${(presetCount++).toString(36)}`;
}

/** A link without the view and the bar's state, which a preset doesn't apply. */
function soundOf(link: string): string {
  const d = decodeLink(link, { settings: DEFAULT_THAMBURA });
  return d ? encodeLink({ ...d, custom: d.custom ?? planFor({ ...d.settings, mode: "jawari" }), view: "studio", open: false }) : link;
}

function loadSafely(store: ThamburaStore | undefined): unknown {
  try {
    return store?.load();
  } catch {
    return undefined;
  }
}
