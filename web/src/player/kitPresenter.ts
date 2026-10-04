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
import { arrangementFor, korvaiCycles, patternForCycle, type Arrangement, type Variety } from "../engine/arrangement";
import { generatedPattern } from "../engine/generated";
import { laneFor, type Lane } from "../engine/lane";
import { patternFor, type Pattern } from "../engine/patterns";
import { ZERO } from "../engine/ratio";
import { DEFAULT_THAMBURA, tunedTonicHz, type ThamburaSettings } from "../engine/shruthi";
import type { Sequencer } from "../engine/sequencer";
import { StrokeSequencer, type StrokeEvent } from "../engine/strokeSequencer";
import { TalaGrid } from "../engine/talaGrid";
import type { AudioOut, TrackId } from "./audio";
import type { Clock, TalaTiming } from "./pageContext";
import type { Store } from "./storage";

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
  /** The pattern it plays with the tala, or null for none. */
  pattern: string | null;
  /** The stroke heard a moment ago, for the pad's glow. */
  lit: string | null;
  /**
   * What it is playing this cycle, for the stroke lane, and which of its
   * strokes is sounding. Null with no tala or no pattern.
   */
  lane: Lane | null;
  strokeIndex: number | null;
  /** How often it swaps in a variation. */
  variety: Variety;
  /** Whether the tala has any alternates to swap in. */
  hasVariations: boolean;
  /** Whether the tala has an ending written for it. */
  hasKorvai: boolean;
  /** True once a korvai is asked for, until the cycle that plays it is heard. */
  korvaiQueued: boolean;
}

export interface KitView {
  setState(state: KitState): void;
}

export interface KitDeps {
  audio: AudioOut;
  /** The audio track it plays on, which is also its id on the page (`kit-1`). */
  track: TrackId;
  /**
   * The page's clock. With it, the kit plays along with the tala on the same
   * transport and follows the tala's cycle; without it, it's only a pad.
   */
  clock?: Clock;
  /** Where its choices (Variety) are kept between visits. */
  store?: Store;
  /**
   * Where the tala kept Variety before the kit had a store of its own. Read
   * once, when the kit's own store has none.
   */
  legacyStore?: Store;
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
 * One struck instrument, as a track on the page: loads a kit, tunes it to the
 * thambura's tonic, and plays on its own audio track. On the page's clock it
 * plays along with the tala, choosing a pattern for the tala's cycle each
 * cycle (with variations and a korvai), and starts, stops and resumes with
 * it. Its pad plays a stroke at a time, which is how a kit gets checked by ear.
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
  // Strokes waiting to be heard: the pad glows for each, and the lane lights
  // those that came from the pattern.
  private cues: { time: number; id: string; index?: number; cycle?: number }[] = [];
  // The tala's cycle, and what the kit plays over it.
  private timing: TalaTiming | null = null;
  private pattern: Pattern | null = null;
  private arrangement: Arrangement | null = null;
  // Which cycle the korvai was given, so the button clears when it is heard.
  private korvaiAt: number | null = null;
  // The korvai cut into cycles (korvaiCycles), from the cycle it starts in.
  private korvaiRun: { from: number; pieces: Pattern[] } | null = null;
  // The lane for each cycle the sequencer has laid out but the ear hasn't
  // reached yet, since a variation changes what the lane should show.
  private readonly lanes = new Map<number, Lane>();
  private litUntil = 0;
  private frameId: number | null = null;
  private readonly watchers: ((state: KitState) => void)[] = [];
  // What it joined the clock with, to leave it again (dispose).
  private onClock: { seq: Sequencer<StrokeEvent>; unfollow: () => void } | null = null;

  constructor(private readonly deps: KitDeps) {
    this.rng = deps.rng ?? Math.random;
    const saved = loadSafely(deps.store);
    const legacy = isVariety(saved.variety) ? undefined : loadSafely(deps.legacyStore).variety;
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
      volume: typeof saved.volume === "number" ? clamp(saved.volume, 0, 100, DEFAULT_KIT_VOLUME) : DEFAULT_KIT_VOLUME,
      levels: {},
      enabled: saved.enabled !== false,
      pattern: null,
      lit: null,
      lane: null,
      strokeIndex: null,
      variety: isVariety(saved.variety) ? saved.variety : isVariety(legacy) ? legacy : "some",
      hasVariations: false,
      hasKorvai: false,
      korvaiQueued: false,
    };
    deps.audio.setBusVolume(deps.track, this.state.volume);
    if (isVariety(legacy)) this.save();
    if (deps.clock) this.playAlong(deps.clock);
  }

  /**
   * Hears every state change, as the view does. More than one part of the
   * page shows a kit (the tala's lane, its track), and the page link follows it.
   */
  watch(f: (state: KitState) => void): void {
    this.watchers.push(f);
  }

  /**
   * Plays a shared link's setup (engine/shareLink.ts, KitSetup) without
   * saving it over this browser's own.
   */
  applyShared(setup: { variety: Variety; volume: number; enabled: boolean }): void {
    this.deps.audio.setLevel(this.deps.track, clamp(setup.volume, 0, 100, DEFAULT_KIT_VOLUME));
    this.update({ variety: isVariety(setup.variety) ? setup.variety : this.state.variety, volume: clamp(setup.volume, 0, 100, DEFAULT_KIT_VOLUME), enabled: setup.enabled });
  }

  /**
   * Leaves the page: off the clock, its track gone and whatever it booked
   * with it. For the track list's Remove; it can't be used afterwards.
   */
  dispose(): void {
    if (this.onClock) {
      this.deps.clock?.transport.remove(this.onClock.seq);
      this.onClock.unfollow();
      this.onClock = null;
    }
    if (this.frameId !== null) this.deps.frames.cancel(this.frameId);
    this.frameId = null;
    this.deps.audio.removeTrack(this.deps.track);
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
    // The tala may have published its cycle before the kit arrived, and the
    // generated fallback needs the kit's own strokes.
    if (this.timing) this.setTiming(this.timing);
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

  /**
   * Whether the kit would sound stretched at `hz`: its nearest recorded
   * tuning is more than SHIFT_WARN_CENTS away. False with no kit loaded.
   */
  stretchedAt(hz: number): boolean {
    const pack = this.kit && nearestPack(this.kit, hz);
    return !!pack && Math.abs(shiftCents(pack, hz)) > SHIFT_WARN_CENTS;
  }

  /** Follows the thambura's settings, so the drum is tuned like the drone. */
  setThambura(settings: ThamburaSettings): void {
    this.setTonic(tunedTonicHz(settings));
  }

  setVolume(percent: number): void {
    const volume = clamp(percent, 0, 100, DEFAULT_KIT_VOLUME);
    this.deps.audio.setLevel(this.deps.track, volume);
    this.update({ volume });
    this.save();
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
    return this.book(id, when, gain);
  }

  /** Turns the instrument off without unloading it, as a mixer's mute does. */
  setEnabled(enabled: boolean): void {
    if (!enabled) this.deps.audio.cancel(this.deps.track);
    this.update({ enabled });
    this.save();
  }

  /**
   * Plays the ending from the next cycle not yet booked. A korvai starts
   * wherever it has to so that it resolves on sam (`korvaiCycles`), plays
   * once, and the accompaniment carries on from there.
   */
  askForKorvai(): void {
    if (!this.arrangement?.korvai || this.state.korvaiQueued) return;
    this.update({ korvaiQueued: true });
  }

  /** How often a variation is swapped in, from the next cycle on. */
  setVariety(variety: Variety): void {
    if (!isVariety(variety) || variety === this.state.variety) return;
    this.update({ variety });
    this.save();
  }

  /** The stroke a key plays, or null. */
  strokeForKey(key: string): string | null {
    return this.state.strokes.find((s) => s.key === key.toLowerCase())?.id ?? null;
  }

  // ---- internals ---------------------------------------------------------

  /**
   * Joins the page's transport, so it starts, stops and resumes with the
   * tala, and follows the tala's cycle to choose what to play.
   */
  private playAlong(clock: Clock): void {
    const seq = new StrokeSequencer(
      (cycle) => this.cycleSource(cycle),
      clock.tempo,
      () => this.timing?.resumesAt ?? ZERO,
    );
    const onClock: Sequencer<StrokeEvent> = {
      start: (at) => seq.start(at),
      stop: (now) => {
        seq.stop(now);
        this.halt();
      },
      pull: (now, until) => seq.pull(now, until),
    };
    clock.transport.add<StrokeEvent>(onClock, (e) => this.book(e.stroke, e.time, e.gain, { index: e.index, cycle: e.cycle }));
    this.onClock = { seq: onClock, unfollow: clock.tala.follow((timing) => this.setTiming(timing)) };
  }

  /** A new cycle from the tala: a written pattern where there is one, otherwise a skeleton from its beats. */
  private setTiming(timing: TalaTiming): void {
    this.timing = timing;
    const { grid, nadai } = timing;
    this.pattern = patternFor(grid, nadai) ?? generatedPattern(grid.beats, grid.shape, grid.patternCounts, this.kit?.fallback);
    this.arrangement = arrangementFor(grid, nadai, this.pattern);
    this.lanes.clear();
    this.korvaiAt = null;
    this.korvaiRun = null;
    this.update({
      pattern: this.pattern?.name ?? null,
      lane: laneFor(this.pattern, timing.counting),
      strokeIndex: null,
      hasVariations: (this.arrangement?.variations.length ?? 0) > 0,
      hasKorvai: this.arrangement?.korvai != null,
      korvaiQueued: false,
    });
  }

  /**
   * What the coming cycle plays. The arrangement decides, and the lane for
   * that cycle is kept until a stroke from it reaches the speakers.
   */
  private cycleSource(cycle: number) {
    const grid = this.timing?.grid ?? EMPTY_GRID;
    if (!this.arrangement) return { grid, pattern: this.pattern };
    // A korvai claims the next cycle to be laid out, once, and as many after
    // it as it needs to land on sam.
    if (this.state.korvaiQueued && this.korvaiAt === null && this.arrangement.korvai) {
      const before = patternForCycle(this.arrangement, cycle, this.state.variety, this.rng);
      this.korvaiAt = cycle;
      this.korvaiRun = { from: cycle, pieces: korvaiCycles(this.arrangement.korvai, before) };
    }
    const piece = this.korvaiRun?.pieces[cycle - this.korvaiRun.from];
    if (this.korvaiRun && !piece) this.korvaiRun = null;
    const pattern = piece ?? patternForCycle(this.arrangement, cycle, this.state.variety, this.rng);
    const lane = laneFor(pattern, this.timing?.counting ?? []);
    if (lane) this.lanes.set(cycle, lane);
    return { grid, pattern };
  }

  /** The tala stopped: take back what hasn't sounded, and any korvai still to come. */
  private halt(): void {
    this.deps.audio.cancel(this.deps.track);
    this.cues = this.cues.filter((c) => c.index === undefined);
    this.korvaiAt = null;
    this.korvaiRun = null;
    if (this.state.korvaiQueued) this.update({ korvaiQueued: false });
  }

  /** Books a stroke, and queues it for the pad's glow and, from a pattern, the lane. */
  private book(id: string, when: number, gain = 1, from?: { index: number; cycle: number }): boolean {
    if (!this.kit || !this.state.enabled) return false;
    const sound = strokeSound(this.kit, id, this.tonic, (takes) => this.take(id, takes), this.baseUrl);
    if (!sound) return false;
    this.deps.audio.play(sound.url, this.deps.track, when, {
      detune: sound.detune,
      gain: gain * (this.state.levels[sound.zone] ?? 1) * (1 - SOFTER * this.rng()),
      choke: `kit/${this.state.kitName}/${sound.zone}`,
      chokeFade: ZONE_CHOKE_FADE,
      ...(sound.bend ? { bend: sound.bend } : {}),
    });
    this.cues.push({ time: when, id, ...from });
    this.runFrames();
    return true;
  }

  private save(): void {
    try {
      const { variety, volume, enabled } = this.state;
      this.deps.store?.save({ variety, volume, enabled });
    } catch {
      // Storage can be full or blocked; the choice still holds for this visit.
    }
  }

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

  /** Lights each pad, and the lane, once its stroke is heard, not when it was scheduled. */
  private runFrames(): void {
    if (this.frameId !== null) return;
    const frame = () => {
      this.frameId = null;
      const heard = this.deps.audio.heardNow;
      while (this.cues.length > 0 && this.cues[0].time <= heard) {
        const cue = this.cues.shift()!;
        this.litUntil = cue.time + GLOW;
        if (this.state.lit !== cue.id) this.update({ lit: cue.id });
        if (cue.index !== undefined && cue.cycle !== undefined) this.heardStroke(cue.index, cue.cycle);
      }
      if (this.state.lit && heard >= this.litUntil) this.update({ lit: null });
      if (this.cues.length > 0 || this.state.lit) this.frameId = this.deps.frames.request(frame);
    };
    this.frameId = this.deps.frames.request(frame);
  }

  /** A pattern's stroke reached the speakers: the lane follows the ear. */
  private heardStroke(index: number, cycle: number): void {
    // A cycle's pattern shows when it sounds.
    const lane = this.lanes.get(cycle);
    if (lane && lane !== this.state.lane) this.update({ lane });
    // The ending is under way, so the button stops saying it is coming.
    if (this.korvaiAt !== null && cycle >= this.korvaiAt) {
      this.korvaiAt = null;
      this.update({ korvaiQueued: false });
    }
    for (const c of this.lanes.keys()) if (c < cycle) this.lanes.delete(c);
    if (index !== this.state.strokeIndex) this.update({ strokeIndex: index });
  }

  private update(patch: Partial<KitState>): void {
    this.state = { ...this.state, ...patch };
    this.view?.setState(this.state);
    for (const f of this.watchers) f(this.state);
  }
}

function clamp(value: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(hi, Math.max(lo, value));
}

const EMPTY_GRID = new TalaGrid([]);

function loadSafely(store: Store | undefined): Record<string, unknown> {
  try {
    const saved = store?.load();
    return typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Whether a saved value is one of the variety settings. */
function isVariety(value: unknown): value is Variety {
  return value === "off" || value === "some" || value === "lots";
}
