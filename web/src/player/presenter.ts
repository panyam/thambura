import { assetUrls, parseCatalog, resolveAsset, type AssetCatalog, type AssetGroup } from "../engine/assets";
import { BeatCursor, type Position } from "../engine/cursor";
import {
  beatsFor,
  clampTempo,
  DEFAULT_SETTINGS,
  normalizeSettings,
  DEFAULT_TEMPO,
  type TalaSettings,
} from "../engine/selection";
import { add, type Ratio } from "../engine/ratio";
import { TalaSequencer, type TalaEvent } from "../engine/sequencer";
import { TalaGrid } from "../engine/talaGrid";
import { DEFAULT_MOTION, isBeatMotion, motionAt, REST, type BeatMotion, type BeatPose } from "../engine/motion";
import type { TempoMap } from "../engine/tempoMap";
import type { AudioOut } from "./audio";
import type { Transport } from "./transport";
import type { Clock } from "./pageContext";

export interface PlayerState {
  status: "loading" | "ready" | "error";
  error: string | null;
  playing: boolean;
  tempo: number;
  settings: TalaSettings;
  imageGroups: string[];
  imageGroup: string;
  /** How the beat image moves between beats (engine/motion.ts). */
  motion: BeatMotion;
  /** The image for the step being heard, or null for none. */
  image: string | null;
  /** The step being heard, and how many beats the cycle has. */
  position: Position;
  beatCount: number;
}

export interface PlayerView {
  setState(state: PlayerState): void;
  /**
   * The beat image's pose (see engine/motion.ts), set every animation frame
   * while playing. It is kept out of PlayerState so a frame doesn't re-render
   * the player.
   */
  setPose?(pose: BeatPose): void;
}

/**
 * Where the player's choices are kept between visits: one record of the
 * motion, tala settings, tempo and image group. (Sounds and Volume are the
 * hands track's, handsPresenter.ts.)
 */
export interface PlayerStore {
  load(): unknown;
  save(value: unknown): void;
}

/** requestAnimationFrame, injectable for tests. */
export interface FrameLoop {
  request(cb: () => void): number;
  cancel(id: number): void;
}

export interface PlayerDeps {
  audio: AudioOut;
  /**
   * The page's clock (pageContext.ts), which the tala plays on, sets the
   * tempo of, and tells where its cycle falls, for the instruments playing
   * along. Required, so the tala and an instrument on the same page can't end
   * up on two clocks.
   */
  clock: Clock;
  frames: FrameLoop;
  fetchJson(url: string): Promise<unknown>;
  preloadImages(urls: string[]): Promise<void>;
  store?: PlayerStore;
}


interface Cue {
  time: number;
  /** Where the next beat starts, in counts, for the motion. */
  endAt: Ratio;
  image: string | null;
  position: Position;
}

/**
 * Runs the tala player. Owns the engine (cursor, sequencer), the transport and
 * the state the view renders; the view only calls the intent methods below.
 * Nothing here touches the DOM or Solid, so it runs under a fake AudioOut.
 */
export class PlayerPresenter {
  state: PlayerState;
  private view: PlayerView | null = null;
  private catalog: AssetCatalog = { soundGroups: [], imageGroups: [] };
  private readonly cursor = new BeatCursor();
  private readonly tempo: TempoMap;
  private readonly seq: TalaSequencer;
  private readonly transport: Transport;
  // Where the cycle's beats fall, which the instruments playing along read.
  private grid = new TalaGrid([]);
  // Images waiting for their sound to reach the speakers, in time order.
  private cues: Cue[] = [];
  // The beat being heard, while playing.
  private heard: Cue | null = null;
  private pose: BeatPose = REST;
  private frameId: number | null = null;
  // What the last visit saved; load() takes its groups once the catalog is in.
  private readonly saved: Record<string, unknown>;

  constructor(private readonly deps: PlayerDeps) {
    this.saved = loadSafely(deps.store);
    this.tempo = deps.clock.tempo;
    this.transport = deps.clock.transport;
    this.seq = new TalaSequencer(this.cursor, this.tempo);
    this.transport.add(this.seq, (e) => this.schedule(e));
    this.state = {
      status: "loading",
      error: null,
      playing: false,
      tempo: typeof this.saved.tempo === "number" ? clampTempo(this.saved.tempo) : DEFAULT_TEMPO,
      settings: normalizeSettings(this.saved.settings ?? DEFAULT_SETTINGS),
      imageGroups: [],
      imageGroup: "",
      motion: isBeatMotion(this.saved.motion) ? this.saved.motion : DEFAULT_MOTION,
      image: null,
      position: { beat: 0, repeat: 0 },
      beatCount: 0,
    };
    this.tempo.setTempo(this.state.tempo);
    this.rebuild();
  }

  attach(view: PlayerView): void {
    this.view = view;
    view.setState(this.state);
  }

  async load(fixturesUrl: string): Promise<void> {
    try {
      this.catalog = parseCatalog(await this.deps.fetchJson(fixturesUrl));
    } catch (err) {
      this.update({ status: "error", error: `Could not load ${fixturesUrl}: ${String(err)}` });
      return;
    }
    // The saved group if the fixture still has it, else its first one.
    const imageGroup = this.findGroup(this.catalog.imageGroups, String(this.saved.imageGroup)) ?? this.catalog.imageGroups[0];
    this.update({ imageGroups: this.catalog.imageGroups.map((g) => g.name) });
    await this.applyImageGroup(imageGroup?.name ?? "");
    this.update({ status: "ready" });
  }

  // ---- intents -----------------------------------------------------------

  async start(): Promise<void> {
    if (this.state.playing) return;
    await this.deps.audio.unlock();
    // The instruments start where the tala does, which after a stop is
    // wherever it stopped, not sam.
    this.publishTiming();
    this.transport.start();
    this.update({ playing: true });
    this.runFrames();
  }

  stop(): void {
    if (!this.state.playing) return;
    // Stopping the transport also tells the hands track to take back its claps.
    this.transport.stop();
    // Drop images for steps that won't sound now; the one showing stays.
    this.cues = [];
    this.heard = null;
    this.setPose(REST);
    this.update({ playing: false });
  }

  toggle(): Promise<void> {
    if (this.state.playing) {
      this.stop();
      return Promise.resolve();
    }
    return this.start();
  }

  /** Steps forward one beat and plays it. Ignored while playing. */
  next(): void {
    if (this.state.playing) return;
    this.cursor.forward();
    void this.playOne();
  }

  /** Steps back one beat and plays it. Ignored while playing. */
  prev(): void {
    if (this.state.playing) return;
    this.cursor.backward();
    void this.playOne();
  }

  /** Back to the start of the cycle; keeps playing if it was. */
  restart(): void {
    if (this.state.playing) {
      this.stop();
      this.cursor.first();
      void this.start();
    } else {
      this.cursor.first();
      void this.playOne();
    }
  }

  setTempo(bpm: number): void {
    const tempo = clampTempo(bpm);
    this.tempo.setTempo(tempo);
    this.update({ tempo });
    this.save();
  }

  /** Changes the tala, jaathi, nadai or kalai; the cycle starts over. */
  setSettings(patch: Partial<TalaSettings>): void {
    const wasPlaying = this.state.playing;
    if (wasPlaying) this.stop();
    this.update({ settings: { ...this.state.settings, ...patch } });
    this.rebuild();
    this.save();
    if (wasPlaying) void this.start();
  }

  async setImageGroup(name: string): Promise<void> {
    if (await this.applyImageGroup(name)) this.save();
  }

  setMotion(motion: BeatMotion): void {
    if (!isBeatMotion(motion)) return;
    this.update({ motion });
    this.save();
  }

  // ---- internals ---------------------------------------------------------

  private async applyImageGroup(name: string): Promise<boolean> {
    const group = this.findGroup(this.catalog.imageGroups, name);
    if (!group) return false;
    await this.deps.preloadImages(assetUrls(group));
    // Show the group's clap image as a preview.
    this.update({ imageGroup: name, image: group.entries["down"] ?? null });
    return true;
  }

  /** Keeps the student's choices for the next visit. Loading never calls this. */
  private save(): void {
    const { motion, settings, tempo, imageGroup } = this.state;
    try {
      this.deps.store?.save({ motion, settings, tempo, imageGroup });
    } catch {
      // Storage can be full or blocked; the choices still hold for this visit.
    }
  }

  private rebuild(): void {
    const beats = beatsFor(this.state.settings);
    this.cursor.setBeats(beats);
    this.cursor.setRepeat(this.state.settings.kalai);
    this.grid = new TalaGrid(beats, this.state.settings.kalai);
    this.publishTiming();
    this.update({ beatCount: beats.length, position: this.cursor.position });
  }

  /** Tells the instruments playing along where the cycle falls, and where the tala will start. */
  private publishTiming(): void {
    const { beat, repeat } = this.cursor.position;
    this.deps.clock.tala.set({
      grid: this.grid,
      nadai: this.state.settings.nadai,
      resumesAt: this.grid.aksharaStart(beat * Math.max(1, this.state.settings.kalai) + repeat),
    });
  }

  /** Plays the cursor's current beat once, now. */
  private async playOne(): Promise<void> {
    await this.deps.audio.unlock();
    const events = this.seq.beatAt(this.deps.audio.now + 0.01);
    if (events.length === 0) return;
    for (const e of events) this.schedule(e);
    this.runFrames();
  }

  private schedule(e: TalaEvent): void {
    if (e.kind === "tick") {
      // Whoever plays the claps hears the call; the tala makes no sound.
      this.deps.clock.ticks.emit({ time: e.time, sound: e.sound });
      return;
    }
    const images = this.findGroup(this.catalog.imageGroups, this.state.imageGroup);
    this.cues.push({
      time: e.time,
      endAt: add(e.at, e.beat.duration),
      image: images ? resolveAsset(images, e.beat.image) : null,
      position: e.position,
    });
  }

  /** Shows each cued image once its sound is heard; runs while there is work. */
  private runFrames(): void {
    if (this.frameId !== null) return;
    const frame = () => {
      this.frameId = null;
      const heard = this.deps.audio.heardNow;
      let due: Cue | undefined;
      while (this.cues.length > 0 && this.cues[0].time <= heard) due = this.cues.shift();
      if (due) this.update({ image: due.image, position: due.position });
      if (this.state.playing) {
        if (due) this.heard = due;
        this.setPose(this.poseAt(heard));
      }
      if (this.state.playing || this.cues.length > 0) {
        this.frameId = this.deps.frames.request(frame);
      }
    };
    this.frameId = this.deps.frames.request(frame);
  }

  /**
   * The image's pose in the heard beat. The beat ends where the next step is
   * booked, or, before that step is pulled, where the tempo map puts it now,
   * so a tempo change mid-beat moves the landing with the sound.
   */
  private poseAt(heard: number): BeatPose {
    const beat = this.heard;
    if (!beat) return REST;
    const end = this.cues[0]?.time ?? this.tempo.secondsAt(beat.endAt);
    return motionAt(this.state.motion, heard - beat.time, end - beat.time);
  }

  private setPose(pose: BeatPose): void {
    const p = this.pose;
    if (pose.scale === p.scale && pose.opacity === p.opacity && pose.lift === p.lift) return;
    this.pose = pose;
    this.view?.setPose?.(pose);
  }

  private findGroup(groups: AssetGroup[], name: string): AssetGroup | undefined {
    return groups.find((g) => g.name === name);
  }

  private update(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch };
    this.view?.setState(this.state);
  }
}

function loadSafely(store: PlayerStore | undefined): Record<string, unknown> {
  try {
    const saved = store?.load();
    return typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

