/**
 * Audio output: one AudioContext and a small mixer shared by every voice.
 *
 *   tala ──────┐
 *   percussion ┼─ master gain ─ limiter ─ speakers
 *   drone ─────┘
 *
 * The tala plays on "tala" and the thambura on "drone"; "percussion" is for
 * the mridangam. Each bus has its own volume. Plucked and struck voices
 * schedule samples ahead of time on the audio clock (see Transport); the
 * sruti drone runs continuous tones on its bus instead.
 */
export type Bus = "tala" | "drone" | "percussion";

/** Per-note adjustments for `play`. */
export interface PlayOptions {
  /** Pitch shift in cents. */
  detune?: number;
  /** Linear gain, 1 = as recorded. */
  gain?: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number;
  /**
   * A choke group. When a later note in the same group starts, this one fades
   * out quickly, as a re-plucked string stops its old vibration. A drum head
   * wants a much faster fade than a string, so `chokeFade` overrides it.
   */
  choke?: string;
  /** How long the choke fade takes, in seconds. Defaults to CHOKE_FADE. */
  chokeFade?: number;
  /**
   * Bends the note's pitch while it sounds, in cents from `detune` over
   * `seconds`, as the mridangam's gumki slides a thom.
   */
  bend?: { cents: number; seconds: number };
}

/** A continuous tone built from a harmonic spectrum. */
export interface ToneSpec {
  frequency: number;
  detune: number;
  gain: number;
  /** Stereo position, -1 (left) to 1 (right). Fixed for the tone's life. */
  pan?: number;
  /** Harmonic amplitudes, index 0 being DC (see reedSpectrum). */
  spectrum: Float32Array;
}

/** A sounding tone. Changes glide over a few tens of ms rather than jump. */
export interface ToneHandle {
  set(patch: Partial<ToneSpec>): void;
  /** Fades out and releases the tone. */
  stop(): void;
}

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
  /** The output sample rate, for rendering samples to add with `addSamples`. */
  readonly sampleRate: number;
  /** Fetches and decodes samples; resolves to the URLs that failed. */
  load(urls: string[]): Promise<string[]>;
  /**
   * Adds mono samples rendered in code to the cache under `key`, which `play`
   * then accepts like a URL. Replaces any samples already under the key.
   */
  addSamples(key: string, data: Float32Array): void;
  /** Forgets samples under `key`. Notes already playing them carry on. */
  dropSamples(key: string): void;
  /** Plays a cached sample at `when` on the audio clock. Unknown keys are ignored. */
  play(url: string, bus: Bus, when: number, opts?: PlayOptions): void;
  /**
   * Cancels what is scheduled on the bus but hasn't started. A sample already
   * sounding rings out, since cutting it off mid-waveform clicks.
   */
  cancel(bus: Bus): void;
  /** Fades out every note sounding on the bus over about `seconds`. */
  release(bus: Bus, seconds: number): void;
  /**
   * Fades out the latest note in a choke group, from `when` over `seconds`, as
   * a finger stops a string. A later note in the group is unaffected, and so
   * is a group with nothing playing.
   */
  damp(group: string, when: number, seconds: number): void;
  /** Starts a continuous tone on the bus, fading in. */
  startTone(bus: Bus, spec: ToneSpec): ToneHandle;
  /** A bus's volume, 0-100. */
  setBusVolume(bus: Bus, percent: number): void;
}

// Time constants (seconds) for tone fades and glides.
const FADE_IN = 0.15;
const FADE_OUT = 0.12;
const GLIDE = 0.03;
/** How fast a choked note fades, in seconds: quick, but not a click. */
export const CHOKE_FADE = 0.08;
/** A note bends over at least this long, so a bend of 0 doesn't click. */
const MIN_BEND = 0.005;

/** A scheduled sample, until it ends. */
interface Note {
  src: AudioBufferSourceNode;
  at: number;
  /** Its own gain node, when it has a gain or a choke group. */
  amp?: GainNode;
  level: number;
  released?: boolean;
  /** Takes back the fade this note put on its choke group's previous note. */
  unchoke?: () => void;
}

export class AudioEngine implements AudioOut {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly buses: Record<Bus, GainNode>;
  private readonly analysers = new Map<Bus, AnalyserNode>();
  // Scheduled notes, until they end, and the latest note in each choke group.
  private readonly active: Record<Bus, Set<Note>> = {
    tala: new Set(),
    drone: new Set(),
    percussion: new Set(),
  };
  private readonly chokeGroups = new Map<string, Note>();
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

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  addSamples(key: string, data: Float32Array): void {
    const buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    this.buffers.set(key, buf);
  }

  dropSamples(key: string): void {
    this.buffers.delete(key);
  }

  play(url: string, bus: Bus, when: number, opts: PlayOptions = {}): void {
    const buffer = this.buffers.get(url);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const detune = opts.detune ?? 0;
    if (detune) src.detune.value = detune;
    const at = Math.max(when, this.ctx.currentTime);
    if (opts.bend) {
      src.detune.setValueAtTime(detune, at);
      src.detune.linearRampToValueAtTime(detune + opts.bend.cents, at + Math.max(MIN_BEND, opts.bend.seconds));
    }
    const level = opts.gain ?? 1;
    const note: Note = { src, at, level };
    let out: AudioNode = src;
    if (level !== 1 || opts.choke) {
      note.amp = this.ctx.createGain();
      note.amp.gain.value = level;
      out = out.connect(note.amp);
    }
    if (opts.pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = opts.pan;
      out = out.connect(p);
    }
    out.connect(this.buses[bus]);
    if (opts.choke) note.unchoke = this.choke(opts.choke, note, opts.chokeFade ?? CHOKE_FADE);
    const scheduled = this.active[bus];
    scheduled.add(note);
    src.onended = () => {
      scheduled.delete(note);
      if (opts.choke && this.chokeGroups.get(opts.choke) === note) this.chokeGroups.delete(opts.choke);
    };
    src.start(at);
  }

  /** Makes `note` the group's latest, fading the previous one out as it starts. */
  private choke(group: string, note: Note, fade: number): () => void {
    const prev = this.chokeGroups.get(group);
    this.chokeGroups.set(group, note);
    const restore = () => {
      if (this.chokeGroups.get(group) !== note) return;
      if (prev) this.chokeGroups.set(group, prev);
      else this.chokeGroups.delete(group);
    };
    if (!prev?.amp || prev.released) return restore;
    const gain = prev.amp.gain;
    gain.setValueAtTime(prev.level, note.at);
    gain.linearRampToValueAtTime(0, note.at + fade);
    return () => {
      gain.cancelScheduledValues(note.at);
      restore();
    };
  }

  cancel(bus: Bus): void {
    const now = this.ctx.currentTime;
    const scheduled = this.active[bus];
    // Newest first, so each cancelled note hands its group back to the one before it.
    for (const note of [...scheduled].reverse()) {
      if (note.at <= now) continue;
      note.unchoke?.();
      note.src.onended = null;
      note.src.stop();
      scheduled.delete(note);
    }
  }

  release(bus: Bus, seconds: number): void {
    const now = this.ctx.currentTime;
    for (const note of this.active[bus]) {
      if (!note.amp || note.released) continue;
      note.released = true;
      note.amp.gain.cancelScheduledValues(now);
      note.amp.gain.setTargetAtTime(0, now, seconds / 4);
      note.src.stop(now + seconds * 1.5);
    }
  }

  damp(group: string, when: number, seconds: number): void {
    const note = this.chokeGroups.get(group);
    if (!note?.amp || note.released) return;
    // Released, so the group's next note doesn't set up a choke fade on it too.
    note.released = true;
    const at = Math.max(when, note.at, this.ctx.currentTime);
    note.amp.gain.setValueAtTime(note.level, at);
    note.amp.gain.linearRampToValueAtTime(0, at + seconds);
    note.src.stop(at + seconds + 0.05);
  }

  startTone(bus: Bus, spec: ToneSpec): ToneHandle {
    const ctx = this.ctx;
    const wave = (spectrum: Float32Array) =>
      ctx.createPeriodicWave(new Float32Array(spectrum.length), spectrum as Float32Array<ArrayBuffer>);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave(spec.spectrum));
    osc.frequency.value = spec.frequency;
    osc.detune.value = spec.detune;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    amp.gain.setTargetAtTime(spec.gain, ctx.currentTime, FADE_IN);
    // A slow swell, like a reed box's bellows.
    const bellows = ctx.createOscillator();
    bellows.frequency.value = 0.12 + 0.08 * Math.random();
    const depth = ctx.createGain();
    depth.gain.value = spec.gain * 0.06;
    bellows.connect(depth).connect(amp.gain);
    let out: AudioNode = osc.connect(amp);
    if (spec.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = spec.pan;
      out = out.connect(p);
    }
    out.connect(this.buses[bus]);
    osc.start();
    bellows.start();

    let gain = spec.gain;
    return {
      set(patch) {
        const now = ctx.currentTime;
        if (patch.frequency !== undefined) osc.frequency.setTargetAtTime(patch.frequency, now, GLIDE);
        if (patch.detune !== undefined) osc.detune.setTargetAtTime(patch.detune, now, GLIDE);
        if (patch.spectrum) osc.setPeriodicWave(wave(patch.spectrum));
        if (patch.gain !== undefined) {
          gain = patch.gain;
          amp.gain.setTargetAtTime(gain, now, GLIDE);
          depth.gain.setTargetAtTime(gain * 0.06, now, GLIDE);
        }
      },
      stop() {
        const now = ctx.currentTime;
        amp.gain.cancelScheduledValues(now);
        amp.gain.setTargetAtTime(0, now, FADE_OUT);
        osc.stop(now + FADE_OUT * 8);
        bellows.stop(now + FADE_OUT * 8);
      },
    };
  }

  /**
   * An AnalyserNode listening to the bus after its volume, for drawing what
   * it plays. Made on first use and shared; it passes nothing on.
   */
  analyser(bus: Bus): AnalyserNode {
    let a = this.analysers.get(bus);
    if (!a) {
      a = this.ctx.createAnalyser();
      a.fftSize = 8192;
      a.smoothingTimeConstant = 0.6;
      this.buses[bus].connect(a);
      this.analysers.set(bus, a);
    }
    return a;
  }

  setBusVolume(bus: Bus, percent: number): void {
    // Squared, because loudness tracks it more evenly than a linear gain.
    const x = Math.min(100, Math.max(0, percent)) / 100;
    this.buses[bus].gain.value = x * x;
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
