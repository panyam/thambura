import { describe, expect, it } from "vitest";
import { BeatCursor } from "../engine/cursor";
import { beatsFor, type TalaSettings } from "../engine/selection";
import { TalaSequencer, type StepEvent } from "../engine/sequencer";
import { TempoMap } from "../engine/tempoMap";
import { FakeTicker } from "./testFakes";
import { Transport } from "./transport";

function voice(settings: Partial<TalaSettings>, map: TempoMap) {
  const s: TalaSettings = { tala: "custom_adi", jaathi: "chatusram", nadai: "chatusram", kalai: 1, ...settings };
  return new TalaSequencer(new BeatCursor(beatsFor(s)), map, () => 0);
}

describe("Transport with a TempoMap", () => {
  it("keeps two voices on one grid through tempo changes", () => {
    // Adi's one-count beats against Misra Chaapu's 7/2-count beat: they
    // start a beat together every 7 counts. Before the shared map, each voice
    // applied a tempo change at its own next beat, so the chaapu kept the old
    // tempo for up to 7/2 counts longer and the two drifted apart.
    const clock = { now: 0 };
    const ticker = new FakeTicker();
    const map = new TempoMap(60);
    const transport = new Transport(clock, ticker, { tempo: map });
    const adi: StepEvent[] = [];
    const chaapu: StepEvent[] = [];
    const keepSteps = (into: StepEvent[]) => (e: { kind: string }) => {
      if (e.kind === "step") into.push(e as StepEvent);
    };
    transport.add(voice({}, map), keepSteps(adi));
    transport.add(voice({ tala: "chaapu_misram" }, map), keepSteps(chaapu));

    transport.start(0);
    const changes = new Map([
      [5, 97],
      [12.3, 143],
      [20.05, 71],
    ]);
    for (let t = 0.025; t < 40; t += 0.025) {
      clock.now = t;
      ticker.onTick?.();
      for (const [at, bpm] of changes) {
        if (Math.abs(t - at) < 0.0125) map.setTempo(bpm);
      }
    }
    transport.stop();

    const adiAt = new Map(adi.map((e) => [`${e.at.n}/${e.at.d}`, e.time]));
    const shared = chaapu.filter((e) => adiAt.has(`${e.at.n}/${e.at.d}`));
    expect(shared.length).toBeGreaterThan(5);
    for (const e of shared) expect(adiAt.get(`${e.at.n}/${e.at.d}`)).toBe(e.time);
    // And the times really did change pace along the way.
    const gaps = adi.slice(1).map((e, i) => +(e.time - adi[i].time).toFixed(6));
    expect(new Set(gaps).size).toBeGreaterThan(3);
  });

  it("never moves a note it has already handed out", () => {
    const clock = { now: 0 };
    const ticker = new FakeTicker();
    const map = new TempoMap(120);
    const transport = new Transport(clock, ticker, { tempo: map });
    const times: number[] = [];
    transport.add(voice({}, map), (e) => times.push(e.time));
    transport.start(0);
    clock.now = 0.49;
    ticker.onTick?.(); // hands out the beat at 0.5 (count 1)
    map.setTempo(30);
    clock.now = 0.6;
    ticker.onTick?.();
    expect(times).toEqual([0, 0, 0.5, 0.5]);
    // The change took effect at the horizon, 0.59 s (count 1.18), so count 2
    // is 0.82 counts of 2 s later.
    clock.now = 2.55;
    ticker.onTick?.();
    const count2 = 0.59 + (2 - 1.18) * 2;
    expect(times.slice(4)).toEqual([expect.closeTo(count2, 9), expect.closeTo(count2, 9)]);
  });
});
