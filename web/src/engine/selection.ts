import type { Beat } from "./beat";
import {
  chaapuBeats,
  customTalaBeats,
  saptaTalaBeats,
  type ChaapuTala,
  type CustomTala,
  type Gati,
  type SaptaTala,
} from "./carnatic";

/**
 * What the student has picked. The tala id carries its family as a prefix
 * because the families read the other settings differently: jaathi only shapes
 * a sapta tala's laghu, nadai applies to sapta and custom talas, and a chaapu
 * ignores both. Kalai (the repeat count) applies to all of them.
 */
export type TalaId = `sapta_${SaptaTala}` | `chaapu_${ChaapuTala}` | `custom_${CustomTala}`;

export interface TalaSettings {
  tala: TalaId;
  jaathi: Gati;
  nadai: Gati;
  kalai: number;
}

export const DEFAULT_SETTINGS: TalaSettings = {
  tala: "sapta_thriputa",
  jaathi: "chatusram",
  nadai: "chatusram",
  kalai: 1,
};

export const MIN_TEMPO = 10;
export const MAX_TEMPO = 300;
export const DEFAULT_TEMPO = 80;

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

export interface OptionGroup<T extends string | number> {
  label: string;
  options: Option<T>[];
}

export const TALA_OPTIONS: OptionGroup<TalaId>[] = [
  {
    label: "Sapta Thaalas",
    options: [
      { value: "sapta_eka", label: "Eka" },
      { value: "sapta_rupaka", label: "Rupakam" },
      { value: "sapta_matya", label: "Matya" },
      { value: "sapta_jhumpa", label: "Jhumpa" },
      { value: "sapta_thriputa", label: "Thriputa" },
      { value: "sapta_ata", label: "Ata" },
      { value: "sapta_dhruva", label: "Dhruva" },
    ],
  },
  {
    label: "Chaapu Thaalas",
    options: [
      { value: "chaapu_thisram", label: "Thisra Chaapu" },
      { value: "chaapu_khandam", label: "Khanda Chaapu" },
      { value: "chaapu_misram", label: "Misra Chaapu" },
      { value: "chaapu_vilomam", label: "Viloma Chaapu" },
      { value: "chaapu_sankeernam", label: "Sankeerna Chaapu" },
    ],
  },
  {
    label: "Custom",
    options: [
      { value: "custom_adi", label: "Adi" },
      { value: "custom_rupakam", label: "Short Rupakam" },
    ],
  },
];

/** Jaathi and nadai share these five choices. */
export const GATI_OPTIONS: Option<Gati>[] = [
  { value: "thisram", label: "Thisram" },
  { value: "chatusram", label: "Chathusram" },
  { value: "khandam", label: "Khandam" },
  { value: "misram", label: "Misram" },
  { value: "sankeernam", label: "Sankeernam" },
];

export const KALAI_OPTIONS: Option<number>[] = [1, 2, 3, 4, 5].map((n) => ({
  value: n,
  label: String(n),
}));

/** Which settings a tala family uses, so the view can disable the rest. */
export function usesJaathi(tala: TalaId): boolean {
  return tala.startsWith("sapta_");
}

export function usesNadai(tala: TalaId): boolean {
  return !tala.startsWith("chaapu_");
}

export function beatsFor(settings: TalaSettings): Beat[] {
  const [family, name] = splitTalaId(settings.tala);
  switch (family) {
    case "sapta":
      return saptaTalaBeats(name as SaptaTala, settings.jaathi, settings.nadai);
    case "chaapu":
      return chaapuBeats(name as ChaapuTala);
    case "custom":
      return customTalaBeats(name as CustomTala, settings.nadai);
  }
}

export function clampTempo(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_TEMPO;
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(bpm)));
}

function splitTalaId(id: TalaId): ["sapta" | "chaapu" | "custom", string] {
  const i = id.indexOf("_");
  return [id.slice(0, i) as "sapta" | "chaapu" | "custom", id.slice(i + 1)];
}
