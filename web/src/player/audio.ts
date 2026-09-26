/**
 * Audio output: one AudioContext and a small mixer shared by every voice.
 *
 *   track "hands-1" ┐
 *   track "drone" ──┼─ master gain ─ limiter ─ speakers
 *   track "kit-1" ──┘
 *
 * Every instrument plays on a track of its own, made the first time its id
 * is used: a level, an on/off gain for mute and solo, and a pan, into the
 * master (see docs/designs/instruments.md). The hand claps play on
 * "hands-1", the thambura on "drone", and each kit on its id from the page
 * (`kit-1`). Plucked and struck voices schedule samples ahead of time on the
 * audio clock (see Transport); the sruti drone runs continuous tones on its
 * track instead.
 */
export type TrackId = string;

/** The name the first three tracks were made under; any track id will do. */
export type Bus = TrackId;

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
  /**
   * Plays a cached sample at `when` on the audio clock, on the track. Unknown
   * keys are ignored. Choke groups are per track, so two drums on two tracks
   * never cut each other off.
   */
  play(url: string, track: TrackId, when: number, opts?: PlayOptions): void;
  /**
   * Cancels what is scheduled on the track but hasn't started. A sample
   * already sounding rings out, since cutting it off mid-waveform clicks.
   */
  cancel(track: TrackId): void;
  /** Fades out every note sounding on the track over about `seconds`. */
  release(track: TrackId, seconds: number): void;
  /**
   * Fades out the latest note in the track's choke group, from `when` over
   * `seconds`, as a finger stops a string. A later note in the group is
   * unaffected, and so is a group with nothing playing.
   */
  damp(track: TrackId, group: string, when: number, seconds: number): void;
  /** Starts a continuous tone on the track, fading in. */
  startTone(track: TrackId, spec: ToneSpec): ToneHandle;
  /** A track's level, 0-100 on a squared curve. Same as `setLevel`. */
  setBusVolume(track: TrackId, percent: number): void;
  /** A track's level, 0-100 on a squared curve. Mute and solo leave it alone. */
  setLevel(track: TrackId, percent: number): void;
  /** Where a track sits, -1 (left) to 1 (right). */
  setPan(track: TrackId, pan: number): void;
  /** Silences a track until unmuted. A muted track stays silent when soloed. */
  setMute(track: TrackId, muted: boolean): void;
  /**
   * Solos a track. While any track is soloed, only soloed tracks sound,
   * including tracks made after the solo.
   */
  setSolo(track: TrackId, soloed: boolean): void;
  /**
   * Stops everything on the track, scheduled or sounding, with a short fade,
   * and forgets it: its level, pan, mute and solo. Using the id again makes a
   * fresh track.
   */
  removeTrack(track: TrackId): void;
}

// Time constants (seconds) for tone fades and glides.
const FADE_IN = 0.15;
const FADE_OUT = 0.12;
const GLIDE = 0.03;
/** How fast a choked note fades, in seconds: quick, but not a click. */
export const CHOKE_FADE = 0.08;
/** A note bends over at least this long, so a bend of 0 doesn't click. */
const MIN_BEND = 0.005;
/** Mute and solo move a track's gain with this time constant: no click. */
const GATE_TC = 0.003;
/** How long a removed track fades before it's cut off and disconnected. */
const REMOVE_FADE = 0.03;

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

/** One instrument's strip on the mixer. */
interface Track {
  level: GainNode;
  /** 1 or 0, from mute and solo, so unmuting brings the level back as it was. */
  gate: GainNode;
  pan: StereoPannerNode;
  muted: boolean;
  soloed: boolean;
  // Scheduled notes, until they end, and the latest note in each choke group.
  notes: Set<Note>;
  chokes: Map<string, Note>;
  /** Stops for the tones sounding on it. */
  tones: Set<() => void>;
  analyser?: AnalyserNode;
}

export class AudioEngine implements AudioOut {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly tracks = new Map<TrackId, Track>();
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
  }

  /** The track, made on first use: level, then on/off, then pan, into the master. */
  private track(id: TrackId): Track {
    let t = this.tracks.get(id);
    if (!t) {
      const level = this.ctx.createGain();
      const gate = this.ctx.createGain();
      // Left at its default, 0, so a probe that wraps the pan setter only
      // sees the pans that were asked for.
      const pan = this.ctx.createStereoPanner();
      level.connect(gate).connect(pan).connect(this.master);
      t = { level, gate, pan, muted: false, soloed: false, notes: new Set(), chokes: new Map(), tones: new Set() };
      this.tracks.set(id, t);
      gate.gain.value = this.audible(t) ? 1 : 0;
    }
    return t;
  }

  private audible(t: Track): boolean {
    if (t.muted) return false;
    return t.soloed || ![...this.tracks.values()].some((o) => o.soloed);
  }

  /** Opens or closes every track's gate to match mute and solo. */
  private regate(): void {
    const now = this.ctx.currentTime;
    for (const t of this.tracks.values()) t.gate.gain.setTargetAtTime(this.audible(t) ? 1 : 0, now, GATE_TC);
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

  play(url: string, id: TrackId, when: number, opts: PlayOptions = {}): void {
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
    const track = this.track(id);
    out.connect(track.level);
    if (opts.choke) note.unchoke = this.choke(track.chokes, opts.choke, note, opts.chokeFade ?? CHOKE_FADE);
    track.notes.add(note);
    src.onended = () => {
      track.notes.delete(note);
      if (opts.choke && track.chokes.get(opts.choke) === note) track.chokes.delete(opts.choke);
    };
    src.start(at);
  }

  /** Makes `note` the group's latest, fading the previous one out as it starts. */
  private choke(groups: Map<string, Note>, group: string, note: Note, fade: number): () => void {
    const prev = groups.get(group);
    groups.set(group, note);
    const restore = () => {
      if (groups.get(group) !== note) return;
      if (prev) groups.set(group, prev);
      else groups.delete(group);
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

  cancel(id: TrackId): void {
    const t = this.tracks.get(id);
    if (t) this.cancelNotes(t);
  }

  private cancelNotes(t: Track): void {
    const now = this.ctx.currentTime;
    const scheduled = t.notes;
    // Newest first, so each cancelled note hands its group back to the one before it.
    for (const note of [...scheduled].reverse()) {
      if (note.at <= now) continue;
      note.unchoke?.();
      note.src.onended = null;
      note.src.stop();
      scheduled.delete(note);
    }
  }

  release(id: TrackId, seconds: number): void {
    const t = this.tracks.get(id);
    if (!t) return;
    const now = this.ctx.currentTime;
    for (const note of t.notes) {
      if (!note.amp || note.released) continue;
      note.released = true;
      note.amp.gain.cancelScheduledValues(now);
      note.amp.gain.setTargetAtTime(0, now, seconds / 4);
      note.src.stop(now + seconds * 1.5);
    }
  }

  damp(id: TrackId, group: string, when: number, seconds: number): void {
    const note = this.tracks.get(id)?.chokes.get(group);
    if (!note?.amp || note.released) return;
    // Released, so the group's next note doesn't set up a choke fade on it too.
    note.released = true;
    const at = Math.max(when, note.at, this.ctx.currentTime);
    note.amp.gain.setValueAtTime(note.level, at);
    note.amp.gain.linearRampToValueAtTime(0, at + seconds);
    note.src.stop(at + seconds + 0.05);
  }

  startTone(id: TrackId, spec: ToneSpec): ToneHandle {
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
    const track = this.track(id);
    out.connect(track.level);
    osc.start();
    bellows.start();

    let gain = spec.gain;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      track.tones.delete(stop);
      const now = ctx.currentTime;
      amp.gain.cancelScheduledValues(now);
      amp.gain.setTargetAtTime(0, now, FADE_OUT);
      osc.stop(now + FADE_OUT * 8);
      bellows.stop(now + FADE_OUT * 8);
    };
    track.tones.add(stop);
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
      stop,
    };
  }

  /**
   * An AnalyserNode listening to the track after its level, mute and solo,
   * for drawing what it plays. Made on first use and shared; it passes
   * nothing on.
   */
  analyser(id: TrackId): AnalyserNode {
    const t = this.track(id);
    if (!t.analyser) {
      t.analyser = this.ctx.createAnalyser();
      t.analyser.fftSize = 8192;
      t.analyser.smoothingTimeConstant = 0.6;
      t.pan.connect(t.analyser);
    }
    return t.analyser;
  }

  setBusVolume(id: TrackId, percent: number): void {
    this.setLevel(id, percent);
  }

  setLevel(id: TrackId, percent: number): void {
    // Squared, because loudness tracks it more evenly than a linear gain.
    const x = Math.min(100, Math.max(0, percent)) / 100;
    this.track(id).level.gain.value = x * x;
  }

  setPan(id: TrackId, pan: number): void {
    this.track(id).pan.pan.value = Math.min(1, Math.max(-1, pan));
  }

  setMute(id: TrackId, muted: boolean): void {
    this.track(id).muted = muted;
    this.regate();
  }

  setSolo(id: TrackId, soloed: boolean): void {
    this.track(id).soloed = soloed;
    this.regate();
  }

  removeTrack(id: TrackId): void {
    const t = this.tracks.get(id);
    if (!t) return;
    this.tracks.delete(id);
    this.regate();
    this.cancelNotes(t);
    const now = this.ctx.currentTime;
    for (const note of t.notes) note.src.stop(now + REMOVE_FADE);
    for (const stop of [...t.tones]) stop();
    t.gate.gain.cancelScheduledValues(now);
    t.gate.gain.setTargetAtTime(0, now, REMOVE_FADE / 4);
    setTimeout(() => t.pan.disconnect(), (REMOVE_FADE * 2 + 0.05) * 1000);
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
