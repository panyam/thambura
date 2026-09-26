/**
 * A stand-in for AudioContext, for testing AudioEngine without Web Audio.
 * Test-only. It keeps the graph (who connects to whom) and every automation
 * call on every param, and plays nothing.
 */

export type Automation =
  | { kind: "set"; value: number; at: number }
  | { kind: "ramp"; value: number; at: number }
  | { kind: "target"; value: number; at: number; tc: number }
  | { kind: "cancel"; at: number };

export class FakeParam {
  events: Automation[] = [];
  constructor(public value: number) {}
  setValueAtTime(value: number, at: number) {
    this.events.push({ kind: "set", value, at });
    return this;
  }
  linearRampToValueAtTime(value: number, at: number) {
    this.events.push({ kind: "ramp", value, at });
    return this;
  }
  setTargetAtTime(value: number, at: number, tc: number) {
    this.events.push({ kind: "target", value, at, tc });
    return this;
  }
  cancelScheduledValues(at: number) {
    this.events.push({ kind: "cancel", at });
    return this;
  }
  /** Where the param ends up: its last scheduled value, else its value. */
  get settled(): number {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.kind !== "cancel") return e.value;
    }
    return this.value;
  }
}

export class FakeNode {
  outputs: (FakeNode | FakeParam)[] = [];
  constructor(public readonly kind: string) {}
  connect<T extends FakeNode | FakeParam>(dest: T): T {
    this.outputs.push(dest);
    return dest;
  }
  disconnect() {
    this.outputs = [];
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
  constructor() {
    super("gain");
  }
}

export class FakePanner extends FakeNode {
  pan = new FakeParam(0);
  constructor() {
    super("panner");
  }
}

export class FakeSource extends FakeNode {
  buffer: unknown = null;
  detune = new FakeParam(0);
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  constructor() {
    super("source");
  }
  start(at = 0) {
    this.startedAt = at;
  }
  stop(at = 0) {
    this.stoppedAt = at;
  }
  /** What the browser does when the sample runs out. */
  end() {
    this.onended?.();
  }
}

export class FakeOscillator extends FakeNode {
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  constructor() {
    super("oscillator");
  }
  setPeriodicWave() {}
  start(at = 0) {
    this.startedAt = at;
  }
  stop(at = 0) {
    this.stoppedAt = at;
  }
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state = "running";
  outputLatency = 0;
  baseLatency = 0;
  readonly destination = new FakeNode("destination");
  /** Every node made, in order. */
  readonly nodes: FakeNode[] = [];

  private make<T extends FakeNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.make(new FakeGain());
  }
  createStereoPanner() {
    return this.make(new FakePanner());
  }
  createBufferSource() {
    return this.make(new FakeSource());
  }
  createOscillator() {
    return this.make(new FakeOscillator());
  }
  createAnalyser() {
    return this.make(Object.assign(new FakeNode("analyser"), { fftSize: 2048, smoothingTimeConstant: 0.8 }));
  }
  createDynamicsCompressor() {
    const p = () => new FakeParam(0);
    return this.make(
      Object.assign(new FakeNode("compressor"), { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() }),
    );
  }
  createPeriodicWave() {
    return {};
  }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    return { length, sampleRate, copyToChannel() {} };
  }
  async resume() {
    this.state = "running";
  }

  sources(): FakeSource[] {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }
  oscillators(): FakeOscillator[] {
    return this.nodes.filter((n): n is FakeOscillator => n instanceof FakeOscillator);
  }
}

/** Whether sound put into `from` reaches `to` through the graph. */
export function reaches(from: FakeNode, to: FakeNode): boolean {
  const seen = new Set<FakeNode>();
  const walk = (n: FakeNode): boolean => {
    if (n === to) return true;
    if (seen.has(n)) return false;
    seen.add(n);
    return n.outputs.some((o) => o instanceof FakeNode && walk(o));
  };
  return walk(from);
}

/** The nodes sound passes through from `from`, one output at a time. */
export function chain(from: FakeNode): FakeNode[] {
  const out: FakeNode[] = [];
  let n: FakeNode | undefined = from;
  while (n && !out.includes(n)) {
    out.push(n);
    n = n.outputs.find((o): o is FakeNode => o instanceof FakeNode && o.kind !== "analyser");
  }
  return out;
}
