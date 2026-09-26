import { stringFrequencies, type ThamburaSettings } from "../engine/shruthi";
import { renderPluck } from "../engine/tambura";
import { patternOf, planFor, type ThamburaPlan } from "../engine/thamburaPlan";
import { ThamburaSequencer, type ThamburaEvent } from "../engine/thamburaSequencer";
import { CHOKE_FADE } from "../player/audio";
import { DAMP_FADE, pluckOptions } from "../player/thamburaPresenter";

/** A rendered drone: stereo samples and what was played when. */
export interface ThamburaMix {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  /** Each string's sounding pitch in Hz, before fine tune. */
  frequencies: number[];
  /** The plucks and damps, in seconds from the start of the mix. */
  events: ThamburaEvent[];
}

/**
 * Plays the thambura offline for `seconds`, the way ThamburaPresenter and
 * AudioEngine do in the browser: the same renders, sequencer, per-pluck
 * options (level, pan, detune), 80 ms choke on a re-pluck and damp fades.
 * For listening to a mode and measuring it (docs/designs/sound-analysis.md); only
 * the limiter and the bus volume are left out. Custom mode plays `custom`,
 * as exported from the Lab view.
 */
export function mixThambura(s: ThamburaSettings, seconds: number, sampleRate: number, seed = 1, custom?: ThamburaPlan): ThamburaMix {
  const plan = planFor(s, custom);
  const frequencies = stringFrequencies(s);
  const samples = frequencies.map((hz, i) => renderPluck(hz, sampleRate, plan.strings[i].voice, i + 1));
  let state = seed;
  // The presenter uses Math.random; a seeded draw keeps a mix repeatable.
  const rng = () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
  const seq = new ThamburaSequencer({ cycleSeconds: s.cycleSeconds, pattern: patternOf(plan) }, rng);
  seq.start(0.25);
  const events = seq.pull(0, seconds);

  interface Note {
    string: number;
    at: number;
    gain: number;
    rate: number;
    pan: number;
    fadeAt: number;
    fade: number;
  }
  const notes: Note[] = [];
  const latest: (Note | undefined)[] = [];
  for (const e of events) {
    const prev = latest[e.string];
    if ("damp" in e) {
      if (prev && prev.fadeAt === Infinity) Object.assign(prev, { fadeAt: e.time, fade: DAMP_FADE });
      continue;
    }
    if (prev && prev.fadeAt === Infinity) Object.assign(prev, { fadeAt: e.time, fade: CHOKE_FADE });
    const o = pluckOptions(plan, s.cents, e);
    const note = { string: e.string, at: e.time, gain: o.gain ?? 1, rate: 2 ** ((o.detune ?? 0) / 1200), pan: o.pan ?? 0, fadeAt: Infinity, fade: 0 };
    notes.push(note);
    latest[e.string] = note;
  }

  const n = Math.round(seconds * sampleRate);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (const note of notes) {
    const x = samples[note.string];
    // A StereoPannerNode's equal-power law for a mono input.
    const angle = ((note.pan + 1) * Math.PI) / 4;
    const l = Math.cos(angle) * note.gain;
    const r = Math.sin(angle) * note.gain;
    const start = Math.round(note.at * sampleRate);
    for (let i = start; i < n; i++) {
      // Detune plays the sample faster, as AudioBufferSourceNode.detune does.
      const pos = (i - start) * note.rate;
      const j = Math.floor(pos);
      if (j + 1 >= x.length) break;
      const t = i / sampleRate;
      const fade = t < note.fadeAt ? 1 : 1 - (t - note.fadeAt) / note.fade;
      if (fade <= 0) break;
      const v = (x[j] + (x[j + 1] - x[j]) * (pos - j)) * fade;
      left[i] += v * l;
      right[i] += v * r;
    }
  }
  return { sampleRate, left, right, frequencies, events };
}
