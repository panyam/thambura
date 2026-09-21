import {
  isPitched,
  kitUrls,
  nearestPack,
  parseKit,
  shiftCents,
  SHIFT_WARN_CENTS,
  strokeSound,
  type Kit,
  type Zone,
} from "../engine/kit";
import { DEFAULT_THAMBURA, tunedTonicHz, type ThamburaSettings } from "../engine/shruthi";
import type { AudioOut } from "./audio";

/** What the pad shows for one stroke. */
export interface PadStroke {
  id: string;
  label: string;
  zone: string;
  note: string;
  /** The key that plays it, for the keyboard and the label. */
  key: string;
  /** False when the kit has no take for it at this tonic. */
  playable: boolean;
}

export interface KitState {
  /** "off" until a kit loads. A missing kit is normal: none is committed yet. */
  status: "off" | "ready";
  kitName: string;
  instrument: string;
  zones: Zone[];
  strokes: PadStroke[];
  /** Whether it is tuned to the singer at all. */
  pitched: boolean;
  /** The tonic it's tuned to, and how it gets there. */
  tonicHz: number;
  packLabel: string;
  shift: number;
  /** True when the shift is far enough to sound like a different drum. */
  stretched: boolean;
  volume: number;
  /** Each zone's level, 0 to 1, so the hands can be balanced against each other. */
  levels: Record<string, number>;
  /** Whether it plays along with the tala. The pad plays either way. */
  enabled: boolean;
  /** The pattern the tala is having it play, or null for none. */
  pattern: string | null;
  /** The stroke heard a moment ago, for the pad's glow. */
  lit: string | null;
}

export interface KitView {
  setState(state: KitState): void;
}

export interface KitDeps {
  audio: AudioOut;
  fetchJson(url: string): Promise<unknown>;
  /** requestAnimationFrame, for the pad glow. Injectable for tests. */
  frames: { request(cb: () => void): number; cancel(id: number): void };
  rng?: () => number;
}

/** The keys under the fingers, in the pad's order. */
const KEYS = ["a", "s", "d", "f", "g", "h", "j", "z", "x", "c", "v", "b"];
export const DEFAULT_KIT_VOLUME = 70;
/** A drum head damps in a few ms; 80 ms is the string setting and would smear. */
export const ZONE_CHOKE_FADE = 0.008;
/** How long a pad stays lit after its stroke is heard, in seconds. */
const GLOW = 0.25;
/** Up to this much softer per hit, so repeats aren't machine-gunned. */
const SOFTER = 0.12;

/**
 * One struck instrument: loads a kit, tunes it to the thambura's tonic, and
 * plays a stroke at a time on the percussion bus. No sequencer yet, so this is
 * the pad a kit gets checked with by ear.
 *
 * It knows nothing about any particular instrument. A closed stroke chokes the
 * ring of the last open stroke in its own zone, as a hand landing on a head
 * does, and never touches another zone.
 */
export class KitPresenter {
  state: KitState;
  private view: KitView | null = null;
  private kit: Kit | null = null;
  private baseUrl = "";
  private tonic = tunedTonicHz(DEFAULT_THAMBURA);
  private readonly rng: () => number;
  // Which take each stroke plays next, so repeats go round rather than repeat.
  private readonly nextTake = new Map<string, number>();
  private cues: { time: number; id: string }[] = [];
  private litUntil = 0;
  private frameId: number | null = null;

  constructor(private readonly deps: KitDeps) {
    this.rng = deps.rng ?? Math.random;
    this.state = {
      status: "off",
      kitName: "",
      instrument: "",
      zones: [],
      strokes: [],
      pitched: false,
      tonicHz: this.tonic,
      packLabel: "",
      shift: 0,
      stretched: false,
      volume: DEFAULT_KIT_VOLUME,
      levels: {},
      enabled: true,
      pattern: null,
      lit: null,
    };
    deps.audio.setBusVolume("percussion", DEFAULT_KIT_VOLUME);
  }

  attach(view: KitView): void {
    this.view = view;
    view.setState(this.state);
  }

  /**
   * Loads a kit and its samples for the current tonic. A kit that isn't there
   * leaves the status "off" and says so in the console, since no kit is
   * committed to this repo yet.
   */
  async load(url: string): Promise<void> {
    let kit: Kit;
    try {
      kit = parseKit(await this.deps.fetchJson(url));
    } catch (err) {
      console.info(`kit: none at ${url} (${String(err)})`);
      return;
    }
    this.kit = kit;
    this.baseUrl = url.replace(/[^/]*$/, "");
    await this.loadSamples();
    this.update({
      status: "ready",
      kitName: kit.name,
      instrument: kit.instrument,
      zones: kit.zones,
      pitched: isPitched(kit),
      levels: Object.fromEntries(kit.zones.map((z) => [z.id, 1])),
      ...this.tuning(),
    });
  }

  // ---- intents -----------------------------------------------------------

  /** Follows the thambura: its tonic is the drum's Sa. */
  setTonic(hz: number): void {
    if (!Number.isFinite(hz) || hz <= 0 || hz === this.tonic) return;
    this.tonic = hz;
    if (!this.kit) {
      this.update({ tonicHz: hz });
      return;
    }
    this.update({ tonicHz: hz, ...this.tuning() });
    void this.loadSamples();
  }

  /** Follows the thambura's settings, so the drum is tuned like the drone. */
  setThambura(settings: ThamburaSettings): void {
    this.setTonic(tunedTonicHz(settings));
  }

  setVolume(percent: number): void {
    const volume = clamp(percent, 0, 100, DEFAULT_KIT_VOLUME);
    this.deps.audio.setBusVolume("percussion", volume);
    this.update({ volume });
  }

  /** One zone's level, 0 to 1, for balancing the hands against each other. */
  setZoneLevel(zone: string, level: number): void {
    if (!this.state.zones.some((z) => z.id === zone)) return;
    this.update({ levels: { ...this.state.levels, [zone]: clamp(level, 0, 1, 1) } });
  }

  /** Plays one stroke now, as a tap on the pad does. */
  async play(id: string): Promise<boolean> {
    if (!this.kit) return false;
    await this.deps.audio.unlock();
    return this.playAt(id, this.deps.audio.now + 0.01);
  }

  /**
   * Books a stroke on the audio clock, which is how a sequencer plays this
   * instrument. `gain` carries the pattern's accent, 1 being a normal stroke.
   * Returns false when the kit has no take for the stroke, or when the
   * instrument is switched off.
   */
  playAt(id: string, when: number, gain = 1): boolean {
    if (!this.kit || !this.state.enabled) return false;
    const sound = strokeSound(this.kit, id, this.tonic, (takes) => this.take(id, takes), this.baseUrl);
    if (!sound) return false;
    this.deps.audio.play(sound.url, "percussion", when, {
      detune: sound.detune,
      gain: gain * (this.state.levels[sound.zone] ?? 1) * (1 - SOFTER * this.rng()),
      choke: `kit/${this.state.kitName}/${sound.zone}`,
      chokeFade: ZONE_CHOKE_FADE,
      ...(sound.bend ? { bend: sound.bend } : {}),
    });
    this.cues.push({ time: when, id });
    this.runFrames();
    return true;
  }

  /** Turns the instrument off without unloading it, as a mixer's mute does. */
  setEnabled(enabled: boolean): void {
    if (!enabled) this.deps.audio.cancel("percussion");
    this.update({ enabled });
  }

  /** What the tala is having it play, for the panel to name. Null for nothing. */
  setPattern(name: string | null): void {
    if (name !== this.state.pattern) this.update({ pattern: name });
  }

  /** The stroke a key plays, or null. */
  strokeForKey(key: string): string | null {
    return this.state.strokes.find((s) => s.key === key.toLowerCase())?.id ?? null;
  }

  // ---- internals ---------------------------------------------------------

  /** Which pack is nearest, how far it has to move, and which strokes it has. */
  private tuning(): Partial<KitState> {
    const kit = this.kit;
    if (!kit) return {};
    const pack = nearestPack(kit, this.tonic);
    const shift = pack ? shiftCents(pack, this.tonic) : 0;
    return {
      tonicHz: this.tonic,
      packLabel: pack ? pack.label : "",
      shift: Math.round(shift),
      stretched: Math.abs(shift) > SHIFT_WARN_CENTS,
      strokes: kit.strokes.map((s, i) => ({
        id: s.id,
        label: s.label,
        zone: s.zone,
        note: s.note,
        key: KEYS[i] ?? "",
        playable: strokeSound(kit, s.id, this.tonic) !== null,
      })),
    };
  }

  private async loadSamples(): Promise<void> {
    if (!this.kit) return;
    const failed = await this.deps.audio.load(kitUrls(this.kit, this.tonic, this.baseUrl));
    if (failed.length > 0) console.warn(`kit: ${failed.length} sample(s) failed`, failed);
  }

  /** The takes in turn, so two hits in a row aren't the same recording. */
  private take(id: string, takes: string[]): string {
    const i = this.nextTake.get(id) ?? Math.floor(this.rng() * takes.length);
    this.nextTake.set(id, (i + 1) % takes.length);
    return takes[i % takes.length];
  }

  /** Lights each pad once its stroke is heard, not when it was scheduled. */
  private runFrames(): void {
    if (this.frameId !== null) return;
    const frame = () => {
      this.frameId = null;
      const heard = this.deps.audio.heardNow;
      while (this.cues.length > 0 && this.cues[0].time <= heard) {
        const cue = this.cues.shift()!;
        this.litUntil = cue.time + GLOW;
        if (this.state.lit !== cue.id) this.update({ lit: cue.id });
      }
      if (this.state.lit && heard >= this.litUntil) this.update({ lit: null });
      if (this.cues.length > 0 || this.state.lit) this.frameId = this.deps.frames.request(frame);
    };
    this.frameId = this.deps.frames.request(frame);
  }

  private update(patch: Partial<KitState>): void {
    this.state = { ...this.state, ...patch };
    this.view?.setState(this.state);
  }
}

function clamp(value: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(hi, Math.max(lo, value));
}
