import { For } from "solid-js";
import { KEYS, SWARAS, type Swara } from "../engine/shruthi";
import {
  centsLabel,
  keyOptionLabel,
  PlayButton,
  RepeatButton,
  SELECT,
  SMALL_BUTTON,
  type ThamburaViewProps,
} from "./thamburaControls";

/** One row: play, key, fine tune, first string and volume. */
export function ThamburaMini(props: ThamburaViewProps) {
  const s = () => props.state().settings;
  const a = props.actions;
  return (
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <PlayButton playing={props.state().playing} onClick={() => void a.toggle()} />
      <select aria-label="Sa (key)" class={SELECT} onChange={(e) => a.set({ key: Number(e.currentTarget.value) })}>
        <For each={KEYS}>{(_, i) => <option value={i()} selected={i() === s().key}>{keyOptionLabel(i())}</option>}</For>
      </select>
      <div class="flex items-center gap-1">
        <RepeatButton label="Tune down a cent" onStep={() => a.nudgeCents(-1)} class={SMALL_BUTTON}>−</RepeatButton>
        <span class="w-12 text-center text-sm tabular-nums" aria-live="polite">{centsLabel(s().cents)}</span>
        <RepeatButton label="Tune up a cent" onStep={() => a.nudgeCents(1)} class={SMALL_BUTTON}>+</RepeatButton>
      </div>
      <select
        aria-label="First string"
        class={SELECT}
        onChange={(e) => a.set({ firstString: e.currentTarget.value as Swara })}
      >
        <For each={SWARAS}>{(sw) => <option value={sw.id} selected={sw.id === s().firstString}>{sw.label}</option>}</For>
      </select>
      <label class="flex min-w-32 flex-1 items-center gap-2 text-sm">
        <span class="sr-only">Thambura volume</span>
        <svg class="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M9 4 5 8H2v4h3l4 4V4zm4.5 1.5a6 6 0 0 1 0 9l-1-1a4.6 4.6 0 0 0 0-7l1-1z" />
        </svg>
        <input
          type="range"
          min={0}
          max={100}
          value={s().volume}
          onInput={(e) => a.set({ volume: e.currentTarget.valueAsNumber })}
          class="w-full accent-amber-600"
        />
      </label>
    </div>
  );
}
