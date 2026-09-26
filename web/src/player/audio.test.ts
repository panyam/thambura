import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine, CHOKE_FADE } from "./audio";
import { chain, FakeAudioContext, FakeGain, FakePanner, reaches, type FakeNode, type FakeSource } from "./fakeAudioContext";

let ctx: FakeAudioContext;
let engine: AudioEngine;

beforeEach(() => {
  ctx = new FakeAudioContext();
  engine = new AudioEngine(ctx as unknown as AudioContext);
  engine.addSamples("s", new Float32Array(16));
});

/** Plays a plain note on `track` and returns its source. */
function note(track: string, when = 0, opts = {}): FakeSource {
  engine.play("s", track, when, opts);
  return ctx.sources().at(-1)!;
}

/** A track's level gain, on/off gain and panner, found from a plain note. */
function trackNodes(track: string) {
  const [, level, gate, pan] = chain(note(track));
  return { level: level as FakeGain, gate: gate as FakeGain, pan: pan as FakePanner };
}

describe("tracks", () => {
  it("makes a track's chain on first use, into the master", () => {
    const kinds = chain(note("mridangam-1")).map((n) => n.kind);
    expect(kinds).toEqual(["source", "gain", "gain", "panner", "gain", "compressor", "destination"]);
  });

  it("keeps one chain per track id", () => {
    const a1 = trackNodes("a");
    const a2 = trackNodes("a");
    const b = trackNodes("b");
    expect(a2.level).toBe(a1.level);
    expect(b.level).not.toBe(a1.level);
    expect(chain(b.pan)[1]).toBe(chain(a1.pan)[1]); // the same master
  });

  it("still plays the three ids used today", () => {
    for (const id of ["tala", "drone", "percussion"]) {
      expect(reaches(note(id), ctx.destination as FakeNode)).toBe(true);
    }
  });

  it("sets a track's level on a squared curve, and setBusVolume does the same", () => {
    engine.setLevel("a", 50);
    expect(trackNodes("a").level.gain.value).toBeCloseTo(0.25);
    engine.setBusVolume("b", 50);
    expect(trackNodes("b").level.gain.value).toBeCloseTo(0.25);
    engine.setLevel("a", 250);
    expect(trackNodes("a").level.gain.value).toBe(1);
  });

  it("pans a track, leaving untouched tracks at the default", () => {
    engine.setPan("a", -0.5);
    expect(trackNodes("a").pan.pan.settled).toBe(-0.5);
    expect(trackNodes("b").pan.pan.events).toEqual([]);
  });

  it("mutes and unmutes a track without losing its level", () => {
    engine.setLevel("a", 60);
    engine.setMute("a", true);
    const a = trackNodes("a");
    expect(a.gate.gain.settled).toBe(0);
    expect(trackNodes("b").gate.gain.settled).toBe(1);
    engine.setMute("a", false);
    expect(a.gate.gain.settled).toBe(1);
    expect(a.level.gain.value).toBeCloseTo(0.36);
  });

  it("solos across tracks", () => {
    const a = trackNodes("a");
    const b = trackNodes("b");
    const c = trackNodes("c");
    engine.setSolo("a", true);
    expect([a, b, c].map((t) => t.gate.gain.settled)).toEqual([1, 0, 0]);
    engine.setSolo("b", true);
    expect([a, b, c].map((t) => t.gate.gain.settled)).toEqual([1, 1, 0]);
    engine.setSolo("a", false);
    engine.setSolo("b", false);
    expect([a, b, c].map((t) => t.gate.gain.settled)).toEqual([1, 1, 1]);
  });

  it("starts a new track silent while another is soloed", () => {
    trackNodes("a");
    engine.setSolo("a", true);
    expect(trackNodes("late").gate.gain.settled).toBe(0);
  });

  it("keeps a muted track silent even when soloed", () => {
    engine.setSolo("a", true);
    engine.setMute("a", true);
    expect(trackNodes("a").gate.gain.settled).toBe(0);
  });

  it("cancels only the track it's asked to", () => {
    const a = note("a", 5);
    const b = note("b", 5);
    engine.cancel("a");
    expect(a.stoppedAt).not.toBeNull();
    expect(b.stoppedAt).toBeNull();
  });

  it("listens after mute, so a muted track's analyser hears nothing", () => {
    const an = engine.analyser("a") as unknown as FakeNode;
    const { level, gate } = trackNodes("a");
    expect(reaches(gate, an)).toBe(true);
    expect(level.outputs).toEqual([gate]); // only through the gate
  });
});

describe("choke groups", () => {
  /** The gain a choked note carries, from its source. */
  const amp = (src: FakeSource) => src.outputs[0] as FakeGain;

  it("chokes within a track as before", () => {
    const first = note("a", 0, { choke: "g" });
    note("a", 1, { choke: "g" });
    expect(amp(first).gain.events).toEqual([
      { kind: "set", value: 1, at: 1 },
      { kind: "ramp", value: 0, at: 1 + CHOKE_FADE },
    ]);
  });

  it("doesn't choke across tracks", () => {
    const first = note("a", 0, { choke: "g" });
    note("b", 1, { choke: "g" });
    expect(amp(first).gain.events).toEqual([]);
  });

  it("damps only the named track's group", () => {
    const a = note("a", 0, { choke: "g" });
    const b = note("b", 0, { choke: "g" });
    engine.damp("a", "g", 2, 0.2);
    expect(amp(a).gain.settled).toBe(0);
    expect(amp(b).gain.events).toEqual([]);
  });
});

describe("removeTrack", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stops what the track has scheduled and sounding, and fades it out", () => {
    ctx.currentTime = 1;
    const sounding = note("a", 0.5);
    const later = note("a", 5);
    const tone = engine.startTone("a", { frequency: 220, detune: 0, gain: 0.3, spectrum: new Float32Array(4) });
    const other = note("b", 5);
    const { gate } = trackNodes("a");
    engine.removeTrack("a");
    expect(later.stoppedAt).not.toBeNull();
    expect(sounding.stoppedAt).toBeGreaterThan(1);
    expect(ctx.oscillators().every((o) => o.stoppedAt !== null)).toBe(true);
    expect(gate.gain.settled).toBe(0);
    expect(other.stoppedAt).toBeNull();
    tone.stop(); // stopping a removed track's tone again is harmless
  });

  it("disconnects the chain once the fade is done, and makes a fresh one on next use", () => {
    const old = trackNodes("a");
    engine.removeTrack("a");
    vi.runAllTimers();
    expect(old.pan.outputs).toEqual([]);
    expect(trackNodes("a").level).not.toBe(old.level);
  });

  it("lets the other tracks sound again when a soloed track goes", () => {
    trackNodes("a");
    const b = trackNodes("b");
    engine.setSolo("a", true);
    engine.removeTrack("a");
    expect(b.gate.gain.settled).toBe(1);
  });
});
