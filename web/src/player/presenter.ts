import { assetUrls, parseCatalog, resolveAsset, type AssetCatalog, type AssetGroup } from "../engine/assets";
import { BeatCursor, type Position } from "../engine/cursor";
import {
  beatsFor,
  clampTempo,
  DEFAULT_SETTINGS,
  DEFAULT_TEMPO,
  type TalaSettings,
} from "../engine/selection";
import { TalaSequencer, type StepEvent, type Tempo } from "../engine/sequencer";
import type { AudioOut } from "./audio";
import { Transport, type Ticker } from "./transport";

export interface PlayerState {
  status: "loading" | "ready" | "error";
  error: string | null;
  playing: boolean;
  tempo: number;
  volume: number;
  settings: TalaSettings;
  soundGroups: string[];
  imageGroups: string[];
  soundGroup: string;
  imageGroup: string;
  /** The image for the step being heard, or null for none. */
  image: string | null;
  /** The step being heard, and how many beats the cycle has. */
  position: Position;
  beatCount: number;
}

export interface PlayerView {
  setState(state: PlayerState): void;
}

/** requestAnimationFrame, injectable for tests. */
export interface FrameLoop {
  request(cb: () => void): number;
  cancel(id: number): void;
}

export interface PlayerDeps {
  audio: AudioOut;
  ticker: Ticker;
  frames: FrameLoop;
  fetchJson(url: string): Promise<unknown>;
  preloadImages(urls: string[]): Promise<void>;
  rng?: () => number;
}

export const DEFAULT_VOLUME = 50;

interface Cue {
  time: number;
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
  private readonly tempo: Tempo = { bpm: DEFAULT_TEMPO };
  private readonly seq: TalaSequencer;
  private readonly transport: Transport;
  // Images waiting for their sound to reach the speakers, in time order.
  private cues: Cue[] = [];
  private frameId: number | null = null;

  constructor(private readonly deps: PlayerDeps) {
    this.seq = new TalaSequencer(this.cursor, this.tempo, deps.rng);
    this.transport = new Transport(deps.audio, deps.ticker);
    this.transport.add(this.seq, (e) => this.schedule(e));
    this.state = {
      status: "loading",
      error: null,
      playing: false,
      tempo: DEFAULT_TEMPO,
      volume: DEFAULT_VOLUME,
      settings: DEFAULT_SETTINGS,
      soundGroups: [],
      imageGroups: [],
      soundGroup: "",
      imageGroup: "",
      image: null,
      position: { beat: 0, repeat: 0 },
      beatCount: 0,
    };
    deps.audio.setVolume(DEFAULT_VOLUME);
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
    const soundGroup = this.catalog.soundGroups[0]?.name ?? "";
    const imageGroup = this.catalog.imageGroups[0]?.name ?? "";
    this.update({
      soundGroups: this.catalog.soundGroups.map((g) => g.name),
      imageGroups: this.catalog.imageGroups.map((g) => g.name),
    });
    await Promise.all([this.setSoundGroup(soundGroup), this.setImageGroup(imageGroup)]);
    this.update({ status: "ready" });
  }

  // ---- intents -----------------------------------------------------------

  async start(): Promise<void> {
    if (this.state.playing) return;
    await this.deps.audio.unlock();
    this.transport.start();
    this.update({ playing: true });
    this.runFrames();
  }

  stop(): void {
    if (!this.state.playing) return;
    this.transport.stop();
    this.deps.audio.cancel("tala");
    // Drop images for steps that won't sound now; the one showing stays.
    this.cues = [];
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
    this.tempo.bpm = tempo;
    this.update({ tempo });
  }

  setVolume(percent: number): void {
    const volume = Math.min(100, Math.max(0, Math.round(Number.isFinite(percent) ? percent : DEFAULT_VOLUME)));
    this.deps.audio.setVolume(volume);
    this.update({ volume });
  }

  /** Changes the tala, jaathi, nadai or kalai; the cycle starts over. */
  setSettings(patch: Partial<TalaSettings>): void {
    const wasPlaying = this.state.playing;
    if (wasPlaying) this.stop();
    this.update({ settings: { ...this.state.settings, ...patch } });
    this.rebuild();
    if (wasPlaying) void this.start();
  }

  async setSoundGroup(name: string): Promise<void> {
    const group = this.findGroup(this.catalog.soundGroups, name);
    if (!group) return;
    const failed = await this.deps.audio.load(assetUrls(group));
    if (failed.length > 0) console.warn(`sound group ${name}: ${failed.length} sample(s) failed`, failed);
    this.update({ soundGroup: name });
  }

  async setImageGroup(name: string): Promise<void> {
    const group = this.findGroup(this.catalog.imageGroups, name);
    if (!group) return;
    await this.deps.preloadImages(assetUrls(group));
    // Show the group's clap image as a preview; random groups have none.
    this.update({ imageGroup: name, image: group.entries["down"] ?? null });
  }

  // ---- internals ---------------------------------------------------------

  private rebuild(): void {
    const beats = beatsFor(this.state.settings);
    this.cursor.setBeats(beats);
    this.cursor.setRepeat(this.state.settings.kalai);
    this.update({ beatCount: beats.length, position: this.cursor.position });
  }

  /** Plays the cursor's current beat once, now. */
  private async playOne(): Promise<void> {
    await this.deps.audio.unlock();
    const step = this.seq.stepAt(this.deps.audio.now + 0.01);
    if (!step) return;
    this.schedule(step);
    this.runFrames();
  }

  private schedule(step: StepEvent): void {
    const sounds = this.findGroup(this.catalog.soundGroups, this.state.soundGroup);
    if (sounds) {
      for (const s of step.sounds) {
        const url = resolveAsset(sounds, s.sound, step.variant);
        if (url) this.deps.audio.play(url, "tala", s.time);
      }
    }
    const images = this.findGroup(this.catalog.imageGroups, this.state.imageGroup);
    this.cues.push({
      time: step.time,
      image: images ? resolveAsset(images, step.beat.image, step.variant) : null,
      position: step.position,
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
      if (this.state.playing || this.cues.length > 0) this.frameId = this.deps.frames.request(frame);
    };
    this.frameId = this.deps.frames.request(frame);
  }

  private findGroup(groups: AssetGroup[], name: string): AssetGroup | undefined {
    return groups.find((g) => g.name === name);
  }

  private update(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch };
    this.view?.setState(this.state);
  }
}
