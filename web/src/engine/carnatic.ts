import type { Beat } from "./beat";
import { ONE, ratio, type Ratio } from "./ratio";

/**
 * Carnatic tala generation: turns a tala + jaathi + nadai choice into the beat
 * list the player steps through.
 *
 * A gati (jaathi or nadai) is one of the classical groupings. As a jaathi it
 * sets how many counts a laghu has; as a nadai it sets how each count is
 * subdivided, via the tick offsets below. Vilomam only exists as a chaapu.
 */
export type Gati = "thisram" | "chatusram" | "khandam" | "misram" | "vilomam" | "sankeernam";

export type Anga = "laghu" | "dhrutham" | "anudhrutham" | "guru" | "plutham" | "kakapadam";

export type SaptaTala = "eka" | "rupaka" | "matya" | "dhruva" | "jhumpa" | "thriputa" | "ata";

export type ChaapuTala = "thisram" | "khandam" | "misram" | "vilomam" | "sankeernam";

export type CustomTala = "adi" | "rupakam";

/**
 * Where each count's sub-beats fall, as fractions of the count. These are the
 * accent patterns rather than even subdivisions: khandam is ta-ka ta-ki-ta
 * (0, 2/5, 3/5), misram ta-ki-ta ta-ka di-mi (0, 1/7, 3/7, 5/7), and so on.
 */
export const TICK_OFFSETS: Record<Gati, Ratio[]> = {
  thisram: fractions(3, [0, 1]),
  chatusram: fractions(1, [0]),
  khandam: fractions(5, [0, 2, 3]),
  misram: fractions(7, [0, 1, 3, 5]),
  vilomam: fractions(7, [0, 2, 3, 5]),
  sankeernam: fractions(9, [0, 2, 4, 6, 7]),
};

/** Counts in a laghu for each jaathi. */
export const JAATHI_COUNTS: Record<Gati, number> = {
  thisram: 3,
  chatusram: 4,
  khandam: 5,
  misram: 7,
  vilomam: 7,
  sankeernam: 9,
};

/** A chaapu tala is a single beat of this many counts. */
export const CHAAPU_DURATIONS: Record<ChaapuTala, Ratio> = {
  thisram: ratio(3, 2),
  khandam: ratio(5, 2),
  misram: ratio(7, 2),
  vilomam: ratio(7, 2),
  sankeernam: ratio(9, 2),
};

/** Fixed-length angas: one beat per sound name. */
const ANGA_TEMPLATES: Record<Exclude<Anga, "laghu">, string[]> = {
  dhrutham: ["down", "open"],
  anudhrutham: ["down"],
  guru: numbered("guru", 8),
  plutham: numbered("plutam", 12),
  kakapadam: numbered("kkpdm", 16),
};

export const SAPTA_TALAS: Record<SaptaTala, Anga[]> = {
  eka: ["laghu"],
  rupaka: ["dhrutham", "laghu"],
  matya: ["laghu", "dhrutham", "laghu"],
  dhruva: ["laghu", "dhrutham", "laghu", "laghu"],
  jhumpa: ["laghu", "anudhrutham", "dhrutham"],
  thriputa: ["laghu", "dhrutham", "dhrutham"],
  ata: ["laghu", "laghu", "dhrutham", "dhrutham"],
};

/** Finger counts after a laghu's opening clap, cycling for long laghus. */
const FINGERS = ["one", "two", "three", "four", "five"];

/** One beat struck with `sound` on each of the nadai's sub-beats. */
export function beatWithNadai(sound: string, nadai: Gati, duration: Ratio = ONE): Beat {
  return {
    image: sound,
    duration,
    ticks: TICK_OFFSETS[nadai].map((offset) => ({ sound, offset })),
  };
}

export function laghuBeats(jaathi: Gati, nadai: Gati): Beat[] {
  const beats = [beatWithNadai("down", nadai)];
  for (let i = 1; i < JAATHI_COUNTS[jaathi]; i++) {
    beats.push(beatWithNadai(FINGERS[(i - 1) % FINGERS.length], nadai));
  }
  return beats;
}

export function angaBeats(anga: Anga, jaathi: Gati, nadai: Gati): Beat[] {
  if (anga === "laghu") return laghuBeats(jaathi, nadai);
  return ANGA_TEMPLATES[anga].map((sound) => beatWithNadai(sound, nadai));
}

export function saptaTalaBeats(tala: SaptaTala, jaathi: Gati, nadai: Gati): Beat[] {
  return SAPTA_TALAS[tala].flatMap((anga) => angaBeats(anga, jaathi, nadai));
}

/**
 * A chaapu is one clap spanning the whole cycle, with its ticks on the chaapu's
 * own accent pattern (not the nadai's).
 */
export function chaapuBeats(tala: ChaapuTala): Beat[] {
  return [
    {
      image: "down",
      duration: CHAAPU_DURATIONS[tala],
      ticks: TICK_OFFSETS[tala].map((offset) => ({ sound: "down", offset })),
    },
  ];
}

/** Common talas written out beat by beat rather than from angas. */
export function customTalaBeats(tala: CustomTala, nadai: Gati): Beat[] {
  const sounds =
    tala === "adi"
      ? ["down", "one", "two", "three", "down", "open", "down", "open"]
      : ["down", "down", "open"];
  return sounds.map((s) => beatWithNadai(s, nadai));
}

/** n1/d, n2/d, ... */
function fractions(d: number, ns: number[]): Ratio[] {
  return ns.map((n) => ratio(n, d));
}

function numbered(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${i + 1}`);
}
