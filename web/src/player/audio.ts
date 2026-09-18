/**
 * Audio output: one AudioContext and a small mixer shared by every voice.
 *
 *   tala ──────┐
 *   percussion ┼─ master gain ─ limiter ─ speakers
 *   drone ─────┘
 *
 * The tala voice plays on "tala" today. "drone" is for the shruthi box and
 * "percussion" for the mridangam; both are wired but silent until those
 * voices exist. Rhythmic voices schedule samples ahead of time on the audio
 * clock (see Transport); the drone will run continuously on its bus instead.
 */
export type Bus = "tala" | "drone" | "percussion";

/** What the presenter needs from audio. Tests supply a fake. */
export interface AudioOut {
  /** The audio clock, in seconds. Events are scheduled against it. */
  readonly now: number;
  /**
   * The audio-clock time reaching the speakers right now: `now` minus the
   * output latency. Visuals key off it so an image appears with its sound.
   */
  readonly heardNow: number;
  /** Starts the context. Browsers only allow this from a user gesture. */
  unlock(): Promise<void>;
  /** Fetches and decodes samples; resolves to the URLs that failed. */
  load(urls: string[]): Promise<string[]>;
  play(url: string, bus: Bus, when: number): void;
  /**
   * Cancels what is scheduled on the bus but hasn't started. A sample already
   * sounding rings out, since cutting it off mid-waveform clicks.
   */
  cancel(bus: Bus): void;
  /** Master volume, 0-100. */
  setVolume(percent: number): void;
}

export class AudioEngine implements AudioOut {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly buses: Record<Bus, GainNode>;
  // Scheduled sources and their start times, until they end.
  private readonly active: Record<Bus, Map<AudioBufferSourceNode, number>> = {
    tala: new Map(),
    drone: new Map(),
    percussion: new Map(),
  };
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();

  constructor(ctx: AudioContext = new AudioContext({ latencyHint: "interactive" })) {
    this.ctx = ctx;

    // A limiter so the voices stacked together can't clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(limiter);

    const bus = () => {
      const g = ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.buses = { tala: bus(), drone: bus(), percussion: bus() };
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  get heardNow(): number {
    // outputLatency is missing in some Safari versions; baseLatency is
    // everywhere. Both are small (tens of ms), so being off by one is harmless.
    const latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return Math.max(0, this.ctx.currentTime - latency);
  }

  async unlock(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  async load(urls: string[]): Promise<string[]> {
    const results = await Promise.all(urls.map((u) => this.loadOne(u)));
    return urls.filter((_, i) => results[i] === null);
  }

  play(url: string, bus: Bus, when: number): void {
    const buffer = this.buffers.get(url);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.buses[bus]);
    const at = Math.max(when, this.ctx.currentTime);
    const scheduled = this.active[bus];
    scheduled.set(src, at);
    src.onended = () => scheduled.delete(src);
    src.start(at);
  }

  cancel(bus: Bus): void {
    const now = this.ctx.currentTime;
    const scheduled = this.active[bus];
    for (const [src, at] of scheduled) {
      if (at <= now) continue;
      src.onended = null;
      src.stop();
      scheduled.delete(src);
    }
  }

  setVolume(percent: number): void {
    // Squared, because loudness tracks it more evenly than a linear gain.
    const x = Math.min(100, Math.max(0, percent)) / 100;
    this.master.gain.value = x * x;
  }

  private loadOne(url: string): Promise<AudioBuffer | null> {
    let p = this.loading.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.arrayBuffer();
        })
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buf) => {
          this.buffers.set(url, buf);
          return buf;
        })
        .catch((err) => {
          console.warn(`sample ${url} failed to load:`, err);
          this.loading.delete(url); // let a later load retry
          return null;
        });
      this.loading.set(url, p);
    }
    return p;
  }
}
