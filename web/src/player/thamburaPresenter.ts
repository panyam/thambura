import {
  DEFAULT_THAMBURA,
  nextRaaginiString,
  normalizeThambura,
  srutiFrequencies,
  stringFrequencies,
  MAX_CENTS,
  type ThamburaSettings,
} from "../engine/shruthi";
import { pluckVoice, reedSpectrum, renderPluck } from "../engine/tambura";
import { ThamburaSequencer, type PluckEvent, type ThamburaTiming } from "../engine/thamburaSequencer";
import type { AudioOut, ToneHandle } from "./audio";
import type { FrameLoop } from "./presenter";
import { Transport, type Ticker } from "./transport";

export type ThamburaViewId = "mini" | "studio" | "raagini";

/** The views the bar's switch offers, in order. */
export const THAMBURA_VIEWS: { id: ThamburaViewId; label: string }[] = [
  { id: "mini", label: "Mini" },
  { id: "studio", label: "Studio" },
  { id: "raagini", label: "Raagini" },
];

export interface ThamburaState {
  settings: ThamburaSettings;
  playing: boolean;
  /** Whether the floating bar is showing. Hiding it doesn't stop the sound. */
  open: boolean;
  view: ThamburaViewId;
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
   * Runs `cb` soon, outside the current call. Plucks are rendered there, since
   * a render takes tens of ms and would make a slider or knob stutter.
   */
  defer(cb: () => void): void;
  store?: ThamburaStore;
  rng?: () => number;
}

// Loudness and stereo place of each string: first, Sa, Sa, low Sa.
const STRING_GAIN = [0.8, 0.7, 0.7, 1];
const STRING_PAN = [-0.25, 0.1, -0.1, 0.25];
// Loudness of the sruti drone's three tones: low, Sa, upper Sa.
const SRUTI_GAIN = [0.22, 0.3, 0.12];
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
  // Sample keys for the four strings, and whether they are stale.
  private stringKeys: string[] = [];
  private stale = true;
  private renderQueued = false;
  // Plucks waiting to be heard, in time order, and when each string goes dark.
  private cues: { time: number; string: number }[] = [];
  private litUntil = [-Infinity, -Infinity, -Infinity, -Infinity];
  private frameId: number | null = null;

  constructor(private readonly deps: ThamburaDeps) {
    const saved = (loadSafely(deps.store) ?? {}) as Record<string, unknown>;
    this.state = {
      settings: normalizeThambura(saved.settings, DEFAULT_THAMBURA),
      playing: false,
      open: saved.open === true,
      view: VIEW_IDS.includes(saved.view as ThamburaViewId) ? (saved.view as ThamburaViewId) : "studio",
      lit: DARK,
    };
    this.timing = { cycleSeconds: this.state.settings.cycleSeconds };
    const seq = new ThamburaSequencer(this.timing, deps.rng);
    this.transport = new Transport(deps.audio, deps.ticker);
    this.transport.add(seq, (e) => this.pluck(e));
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
    this.update({ settings: next });
    this.save();

    if (next.volume !== prev.volume) this.deps.audio.setBusVolume("drone", next.volume);
    this.timing.cycleSeconds = next.cycleSeconds;

    const retimbred = (["key", "a4", "firstString", "temperament", "voice", "tone", "pluck", "sustain"] as const).some(
      (k) => next[k] !== prev[k],
    );
    if (retimbred) this.invalidate();

    if (!this.state.playing) return;
    if (next.mode !== prev.mode) {
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
      return;
    }
    if (this.stale) this.render();
    this.transport.start();
    this.runFrames();
  }

  private stopVoice(mode = this.state.settings.mode): void {
    if (mode === "sruti") {
      for (const t of this.tones) t.stop();
      this.tones = [];
      return;
    }
    this.transport.stop();
    this.deps.audio.cancel("drone");
    this.cues = [];
  }

  private startTones(): void {
    const s = this.state.settings;
    const spectrum = reedSpectrum(s.tone);
    this.tones = srutiFrequencies(s).map((frequency, i) =>
      this.deps.audio.startTone("drone", { frequency, detune: s.cents, gain: SRUTI_GAIN[i], spectrum }),
    );
  }

  private retuneTones(toneChanged: boolean): void {
    const s = this.state.settings;
    const spectrum = toneChanged ? reedSpectrum(s.tone) : undefined;
    srutiFrequencies(s).forEach((frequency, i) => this.tones[i]?.set({ frequency, detune: s.cents, spectrum }));
  }

  /** Marks the plucks stale; while playing, re-renders them once, soon. */
  private invalidate(): void {
    this.stale = true;
    if (!this.state.playing || this.state.settings.mode !== "tambura" || this.renderQueued) return;
    this.renderQueued = true;
    this.deps.defer(() => {
      this.renderQueued = false;
      if (this.stale) this.render();
    });
  }

  /** Renders a pluck per distinct string pitch and drops samples no string uses now. */
  private render(): void {
    const s = this.state.settings;
    const voice = pluckVoice(s);
    const { audio } = this.deps;
    const voiceId = [voice.brightness, voice.firmness, voice.ringSeconds, voice.jawari].map((v) => v.toFixed(3)).join("/");
    const keys = stringFrequencies(s).map((hz) => `thambura/${hz.toFixed(3)}/${voiceId}`);
    const unique = [...new Set(keys)];
    const old = new Set(this.stringKeys);
    unique.forEach((key, i) => {
      if (old.has(key)) return;
      const hz = stringFrequencies(s)[keys.indexOf(key)];
      audio.addSamples(key, renderPluck(hz, audio.sampleRate, voice, i + 1));
    });
    for (const key of old) if (!unique.includes(key)) audio.dropSamples(key);
    this.stringKeys = keys;
    this.stale = false;
  }

  private pluck(e: PluckEvent): void {
    this.deps.audio.play(this.stringKeys[e.string], "drone", e.time, {
      detune: this.state.settings.cents,
      gain: e.gain * STRING_GAIN[e.string],
      pan: STRING_PAN[e.string],
    });
    this.cues.push({ time: e.time, string: e.string });
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

  private save(): void {
    const { settings, view, open } = this.state;
    try {
      this.deps.store?.save({ settings, view, open });
    } catch {
      // Storage can be full or blocked; the settings just won't be remembered.
    }
  }

  private update(patch: Partial<ThamburaState>): void {
    this.state = { ...this.state, ...patch };
    this.view?.setState(this.state);
  }
}

function loadSafely(store: ThamburaStore | undefined): unknown {
  try {
    return store?.load();
  } catch {
    return undefined;
  }
}
