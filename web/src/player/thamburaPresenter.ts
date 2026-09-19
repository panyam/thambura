import {
  DEFAULT_THAMBURA,
  nextRaaginiString,
  normalizeThambura,
  srutiFrequencies,
  stringFrequencies,
  MAX_CENTS,
  type ThamburaSettings,
} from "../engine/shruthi";
import { PluckRender, reedSpectrum } from "../engine/tambura";
import { normalizePlan, patternOf, planFor, type ThamburaPlan } from "../engine/thamburaPlan";
import { ThamburaSequencer, type DampEvent, type PluckEvent, type ThamburaTiming } from "../engine/thamburaSequencer";
import type { AudioOut, PlayOptions, ToneHandle } from "./audio";
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
  /** Whether the floating bar is showing. Hiding it doesn't stop the sound. */
  open: boolean;
  view: ThamburaViewId;
  /** The plan the Custom mode plays, edited in the Lab view. */
  custom: ThamburaPlan;
  /** Strings whose pluck was heard a moment ago, for the glow and the LEDs. */
  lit: [boolean, boolean, boolean, boolean];
}

export interface ThamburaView {
  setState(state: ThamburaState): void;
}

/** Where the settings, view and open state are kept between visits. */
export interface ThamburaStore {
  load(): unknown;
  save(value: unknown): void;
}

export interface ThamburaDeps {
  audio: AudioOut;
  ticker: Ticker;
  frames: FrameLoop;
  /**
   * Runs `cb` after `ms`, outside the current call. Plucks are rendered
   * there, a slice at a time, so a slider or knob doesn't stutter.
   */
  defer(cb: () => void, ms: number): void;
  store?: ThamburaStore;
  rng?: () => number;
}

// Work per deferred render call, in harmonic-samples (see PluckRender.step):
// about 20 ms, inside the transport's 75 ms margin.
const RENDER_BUDGET = 6_000_000;
// After a settings change, rendering waits this long so a knob turned through
// several keys renders once. Later slices, and the first render on Start, don't wait.
const RENDER_SETTLE_MS = 60;
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
  private readonly timing: ThamburaTiming;
  private readonly transport: Transport;
  private tones: ToneHandle[] = [];
  // Sample keys the four strings play, every key added to the audio cache,
  // and whether the strings' samples are out of date.
  private stringKeys: string[] = [];
  private readonly rendered = new Set<string>();
  private stale = true;
  private renderQueued = false;
  // The pluck being rendered across deferred calls, and whether the transport
  // should start once every string has its samples.
  private job: { key: string; render: PluckRender } | null = null;
  private startWhenReady = false;
  // Plucks waiting to be heard, in time order, and when each string goes dark.
  private cues: { time: number; string: number }[] = [];
  private litUntil = [-Infinity, -Infinity, -Infinity, -Infinity];
  private frameId: number | null = null;

  constructor(private readonly deps: ThamburaDeps) {
    const saved = (loadSafely(deps.store) ?? {}) as Record<string, unknown>;
    const settings = normalizeThambura(saved.settings, DEFAULT_THAMBURA);
    this.state = {
      settings,
      playing: false,
      open: saved.open === true,
      view: VIEW_IDS.includes(saved.view as ThamburaViewId) ? (saved.view as ThamburaViewId) : "studio",
      custom: normalizePlan(saved.custom, planFor({ ...settings, mode: "jawari" })),
      lit: DARK,
    };
    this.timing = { cycleSeconds: settings.cycleSeconds, pattern: patternOf(this.plan()) };
    const seq = new ThamburaSequencer(this.timing, deps.rng);
    this.transport = new Transport(deps.audio, deps.ticker);
    this.transport.add(seq, (e) => ("damp" in e ? this.damp(e) : this.pluck(e)));
    deps.audio.setBusVolume("drone", this.state.settings.volume);
  }

  attach(view: ThamburaView): void {
    this.view = view;
    view.setState(this.state);
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
   * Replaces the Custom mode's plan (clamped to the Lab's ranges) and
   * switches to Custom, so the change is heard. Voice changes re-render the
   * strings they touch shortly after; level, pan, detune and timing apply at
   * the next pluck.
   */
  setCustom(plan: ThamburaPlan): void {
    const custom = normalizePlan(plan, this.state.custom);
    this.apply({ ...this.state.settings, mode: "custom" }, custom);
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

    const plan = this.plan();
    if (next.volume !== prev.volume) this.deps.audio.setBusVolume("drone", next.volume);
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
    this.update({ view });
    this.save();
  }

  setOpen(open: boolean): void {
    this.update({ open });
    this.save();
  }

  toggleOpen(): void {
    this.setOpen(!this.state.open);
  }

  // ---- internals ---------------------------------------------------------

  private startVoice(): void {
    if (this.state.settings.mode === "sruti") {
      this.startTones();
    } else if (this.stale) {
      // Rendering takes a moment; the first pluck waits for it.
      this.startWhenReady = true;
      this.queueRender();
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
    this.deps.audio.cancel("drone");
    this.deps.audio.release("drone", STOP_FADE);
    this.cues = [];
  }

  private startTones(): void {
    const s = this.state.settings;
    const spectrum = reedSpectrum(s.tone);
    this.tones = srutiFrequencies(s).map((frequency, i) =>
      this.deps.audio.startTone("drone", { frequency, detune: s.cents, gain: SRUTI_GAIN[i], pan: SRUTI_PAN[i], spectrum }),
    );
  }

  private retuneTones(toneChanged: boolean): void {
    const s = this.state.settings;
    const spectrum = toneChanged ? reedSpectrum(s.tone) : undefined;
    srutiFrequencies(s).forEach((frequency, i) => this.tones[i]?.set({ frequency, detune: s.cents, spectrum }));
  }

  /** Marks the plucks stale; while plucking, starts re-rendering them soon. */
  private invalidate(): void {
    this.stale = true;
    if (this.state.playing && isPlucked(this.state.settings.mode)) this.queueRender(RENDER_SETTLE_MS);
  }

  /**
   * Renders a slice of a pluck per deferred call. A whole 9 s tambura pluck
   * takes about 100 ms, which would stall the main thread past the
   * transport's 75 ms margin and make the tala late. The strings keep their
   * old samples until every new one is ready.
   */
  private queueRender(delayMs = 0): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    this.deps.defer(() => {
      this.renderQueued = false;
      if (this.stale && this.renderStep()) {
        this.queueRender();
      } else if (this.startWhenReady) {
        this.startWhenReady = false;
        this.startPlucking();
      }
    }, delayMs);
  }

  /**
   * Renders a slice of one sample the current settings need and returns true,
   * or, when none are missing, switches the strings over to them, drops
   * samples no string uses, and returns false.
   */
  private renderStep(): boolean {
    const s = this.state.settings;
    const { audio } = this.deps;
    const plan = this.plan();
    const keys = sampleKeys(s, plan);
    const missing = keys.findIndex((k) => !this.rendered.has(k));
    if (missing >= 0) {
      if (this.job?.key !== keys[missing]) {
        const hz = stringFrequencies(s)[missing];
        this.job = { key: keys[missing], render: new PluckRender(hz, audio.sampleRate, plan.strings[missing].voice, missing + 1) };
      }
      if (this.job.render.step(RENDER_BUDGET)) {
        audio.addSamples(this.job.key, this.job.render.result());
        this.rendered.add(this.job.key);
        this.job = null;
      }
      return true;
    }
    for (const key of this.rendered) {
      if (keys.includes(key)) continue;
      audio.dropSamples(key);
      this.rendered.delete(key);
    }
    this.stringKeys = keys;
    this.stale = false;
    return false;
  }

  private pluck(e: PluckEvent): void {
    this.deps.audio.play(this.stringKeys[e.string], "drone", e.time, pluckOptions(this.plan(), this.state.settings.cents, e));
    this.cues.push({ time: e.time, string: e.string });
  }

  private damp(e: DampEvent): void {
    this.deps.audio.damp(`thambura/string${e.string}`, e.time, DAMP_FADE);
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
    const { settings, view, open, custom } = this.state;
    try {
      this.deps.store?.save({ settings, view, open, custom });
    } catch {
      // Storage can be full or blocked; the settings just won't be remembered.
    }
  }

  private update(patch: Partial<ThamburaState>): void {
    this.state = { ...this.state, ...patch };
    this.view?.setState(this.state);
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

function loadSafely(store: ThamburaStore | undefined): unknown {
  try {
    return store?.load();
  } catch {
    return undefined;
  }
}
