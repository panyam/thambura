import type { AudioOut, Bus, PlayOptions, ToneHandle, ToneSpec } from "./audio";
import type { FrameLoop } from "./presenter";
import type { Ticker } from "./transport";

/** Fakes for the presenters' browser dependencies. Test-only. */

export interface FakeTone {
  bus: Bus;
  spec: ToneSpec;
  stopped: boolean;
}

export class FakeAudio implements AudioOut {
  now = 0;
  latency = 0;
  sampleRate = 8000;
  unlocked = 0;
  busVolume: Partial<Record<Bus, number>> = {};
  loaded: string[] = [];
  samples = new Map<string, Float32Array>();
  dropped: string[] = [];
  played: { url: string; bus: Bus; when: number; opts?: PlayOptions }[] = [];
  cancelled: Bus[] = [];
  released: { bus: Bus; seconds: number }[] = [];
  tones: FakeTone[] = [];
  get heardNow() {
    return this.now - this.latency;
  }
  async unlock() {
    this.unlocked++;
  }
  async load(urls: string[]) {
    this.loaded.push(...urls);
    return [];
  }
  addSamples(key: string, data: Float32Array) {
    this.samples.set(key, data);
  }
  dropSamples(key: string) {
    this.samples.delete(key);
    this.dropped.push(key);
  }
  play(url: string, bus: Bus, when: number, opts?: PlayOptions) {
    this.played.push(opts ? { url, bus, when, opts } : { url, bus, when });
  }
  cancel(bus: Bus) {
    this.cancelled.push(bus);
  }
  release(bus: Bus, seconds: number) {
    this.released.push({ bus, seconds });
  }
  startTone(bus: Bus, spec: ToneSpec): ToneHandle {
    const tone: FakeTone = { bus, spec: { ...spec }, stopped: false };
    this.tones.push(tone);
    return {
      set: (patch) => Object.assign(tone.spec, patch),
      stop: () => {
        tone.stopped = true;
      },
    };
  }
  setBusVolume(bus: Bus, p: number) {
    this.busVolume[bus] = p;
  }
}

export class FakeTicker implements Ticker {
  onTick: (() => void) | null = null;
  start(_ms: number, onTick: () => void) {
    this.onTick = onTick;
  }
  stop() {
    this.onTick = null;
  }
}

export class FakeFrames implements FrameLoop {
  queue: (() => void)[] = [];
  request(cb: () => void) {
    this.queue.push(cb);
    return this.queue.length;
  }
  cancel() {}
  flush() {
    const q = this.queue;
    this.queue = [];
    q.forEach((cb) => cb());
  }
}
