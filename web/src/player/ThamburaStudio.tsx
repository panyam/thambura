import { For, type JSX } from "solid-js";
import { KEYS, MAX_A4, MAX_CYCLE, MIN_A4, MIN_CYCLE, stringLabels, SWARAS, type ThamburaSettings } from "../engine/shruthi";
import {
  centsLabel,
  hzLabel,
  keyOptionLabel,
  PlayButton,
  RepeatButton,
  Segmented,
  SMALL_BUTTON,
  type ThamburaViewProps,
} from "./thamburaControls";

const WHITE_KEYS = KEYS.map((k, i) => ({ ...k, i })).filter((k) => !k.note.includes("#"));
const BLACK_KEYS = KEYS.map((k, i) => ({ ...k, i })).filter((k) => k.note.includes("#"));
// A black key's width as a share of a white key's.
const BLACK_WIDTH = 0.6;

/** The full panel: key strip, strings, fine tune, first string and the sound settings. */
export function ThamburaStudio(props: ThamburaViewProps) {
  const st = () => props.state();
  const s = () => st().settings;
  const a = props.actions;
  const set = (patch: Partial<ThamburaSettings>) => a.set(patch);

  return (
    <div class="grid gap-5">
      <div class="flex flex-wrap items-center gap-3">
        <PlayButton playing={st().playing} onClick={() => void a.toggle()} class="h-12 w-12" />
        <div class="min-w-0">
          <div class="text-2xl font-semibold tabular-nums">
            {keyOptionLabel(s().key)} <span class="text-sm font-normal text-gray-500 dark:text-gray-400">kattai</span>
          </div>
          <div class="text-sm tabular-nums text-gray-500 dark:text-gray-400">
            {hzLabel(s())} · {centsLabel(s().cents)}
          </div>
        </div>
        <div class="ml-auto">
          <Segmented
            label="Mode"
            value={s().mode}
            options={[
              { value: "tambura", label: "Tambura" },
              { value: "guitar", label: "Guitar" },
              { value: "sruti", label: "Sruti" },
            ]}
            onChange={(mode) => set({ mode })}
          />
        </div>
      </div>

      <div class="flex flex-wrap items-end justify-between gap-4">
        <Strings {...props} />
        <div class="grid gap-3">
          <Segmented
            label="Tambura"
            value={s().voice}
            options={[
              { value: "gents", label: "Gents" },
              { value: "ladies", label: "Ladies" },
            ]}
            onChange={(voice) => set({ voice })}
          />
          <div class="flex items-center gap-1">
            <RepeatButton label="Tune down a cent" onStep={() => a.nudgeCents(-1)} class={SMALL_BUTTON}>−</RepeatButton>
            <button
              type="button"
              title="Reset fine tune"
              onClick={() => set({ cents: 0 })}
              class="w-16 rounded-md py-1.5 text-center text-sm tabular-nums hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {centsLabel(s().cents)}
            </button>
            <RepeatButton label="Tune up a cent" onStep={() => a.nudgeCents(1)} class={SMALL_BUTTON}>+</RepeatButton>
          </div>
        </div>
      </div>

      <KeyStrip value={s().key} onChange={(key) => set({ key })} />

      <fieldset>
        <legend class="mb-2 text-sm font-medium">First string</legend>
        <div class="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          <For each={SWARAS}>
            {(sw) => (
              <button
                type="button"
                aria-pressed={sw.id === s().firstString}
                onClick={() => set({ firstString: sw.id })}
                class={`rounded-md border px-1 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  sw.id === s().firstString
                    ? "border-amber-600 bg-amber-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {sw.label}
              </button>
            )}
          </For>
        </div>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Speed"
          readout={`${s().cycleSeconds.toFixed(1)} s round`}
          min={MIN_CYCLE}
          max={MAX_CYCLE}
          step={0.1}
          // Right is faster, which is a shorter round.
          value={MIN_CYCLE + MAX_CYCLE - s().cycleSeconds}
          onInput={(v) => set({ cycleSeconds: MIN_CYCLE + MAX_CYCLE - v })}
        />
        <Slider label="Volume" readout={`${s().volume}%`} min={0} max={100} value={s().volume} onInput={(volume) => set({ volume })} />
      </div>

      <details class="group rounded-lg border border-gray-200 dark:border-gray-700">
        <summary class="cursor-pointer select-none px-3 py-2 text-sm font-medium">Sound</summary>
        <div class="grid gap-4 px-3 pb-3 sm:grid-cols-3">
          {/* These re-render the plucks, so they apply on release rather than while dragging. */}
          <Slider label="Tone" readout={`${s().tone}`} min={0} max={100} value={s().tone} onChange={(tone) => set({ tone })} />
          <Slider label="Pluck" readout={`${s().pluck}`} min={0} max={100} value={s().pluck} onChange={(pluck) => set({ pluck })} />
          <Slider label="Sustain" readout={`${s().sustain}`} min={0} max={100} value={s().sustain} onChange={(sustain) => set({ sustain })} />
          <div class="flex flex-wrap items-center gap-3 sm:col-span-3">
            <Segmented
              label="Tuning"
              size="sm"
              value={s().temperament}
              options={[
                { value: "just", label: "Just" },
                { value: "equal", label: "Equal" },
              ]}
              onChange={(temperament) => set({ temperament })}
            />
            <label class="flex items-center gap-2 text-sm">
              A4
              <input
                type="number"
                min={MIN_A4}
                max={MAX_A4}
                step={0.5}
                value={s().a4}
                onChange={(e) => {
                  set({ a4: e.currentTarget.valueAsNumber });
                  e.currentTarget.value = String(s().a4);
                }}
                class="w-20 rounded-md border-gray-300 bg-white py-1 text-right text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              Hz
            </label>
          </div>
        </div>
      </details>
    </div>
  );
}

/** The four strings, lit as each pluck is heard. The lower-octave strings carry a dot below. */
function Strings(props: ThamburaViewProps) {
  const st = () => props.state();
  const labels = () => stringLabels(st().settings);
  const lower = [true, false, false, true];
  const on = (i: number) => (st().settings.mode === "sruti" ? st().playing : st().lit[i]);
  return (
    <div class="flex items-end gap-5 px-2" aria-hidden="true">
      <For each={[0, 1, 2, 3]}>
        {(i) => (
          <div class="flex flex-col items-center gap-1.5">
            <div
              class={`h-24 rounded-full transition-all duration-150 ${
                on(i)
                  ? "w-[3px] bg-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,0.7)]"
                  : "w-[2px] bg-gray-300 dark:bg-gray-600"
              }`}
            />
            <span class="text-xs font-medium">{labels()[i]}</span>
            <span class={`-mt-1.5 h-1 w-1 rounded-full ${lower[i] ? "bg-current" : ""}`} />
          </div>
        )}
      </For>
    </div>
  );
}

/** A piano-style strip from A2 to B3, each key labelled with its kattai. */
function KeyStrip(props: { value: number; onChange: (key: number) => void }) {
  const whiteBefore = (i: number) => WHITE_KEYS.filter((w) => w.i < i).length;
  const width = 100 / WHITE_KEYS.length;
  return (
    <div role="radiogroup" aria-label="Sa (key)" class="relative h-24 select-none">
      <div class="flex h-full">
        <For each={WHITE_KEYS}>
          {(k) => (
            <KeyButton
              selected={props.value === k.i}
              onClick={() => props.onChange(k.i)}
              label={keyOptionLabel(k.i)}
              class={`flex-1 rounded-b-md border border-gray-300 pb-1 dark:border-gray-600 ${
                props.value === k.i ? "bg-amber-500 text-white" : "bg-white text-gray-700 hover:bg-amber-50 dark:bg-gray-100"
              }`}
            >
              <span class="text-[11px] font-semibold">{k.note}</span>
              <span class="text-[10px] opacity-70">{k.kattai}</span>
            </KeyButton>
          )}
        </For>
      </div>
      <For each={BLACK_KEYS}>
        {(k) => (
          <KeyButton
            selected={props.value === k.i}
            onClick={() => props.onChange(k.i)}
            label={keyOptionLabel(k.i)}
            class={`absolute top-0 h-[58%] rounded-b-md pb-1 shadow ${
              props.value === k.i ? "bg-amber-600 text-white" : "bg-gray-900 text-gray-300 hover:bg-gray-700"
            }`}
            style={{ left: `${whiteBefore(k.i) * width - (BLACK_WIDTH * width) / 2}%`, width: `${BLACK_WIDTH * width}%` }}
          >
            <span class="text-[9px]">{k.kattai}</span>
          </KeyButton>
        )}
      </For>
    </div>
  );
}

function KeyButton(props: {
  selected: boolean;
  onClick: () => void;
  label: string;
  class: string;
  style?: JSX.CSSProperties;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      aria-label={props.label}
      onClick={() => props.onClick()}
      class={`flex flex-col items-center justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${props.class}`}
      style={props.style}
    >
      {props.children}
    </button>
  );
}

function Slider(props: {
  label: string;
  readout: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onInput?: (v: number) => void;
  onChange?: (v: number) => void;
}) {
  return (
    <label class="block">
      <span class="mb-1 flex items-center justify-between text-sm">
        <span class="font-medium">{props.label}</span>
        <span class="tabular-nums text-gray-500 dark:text-gray-400">{props.readout}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(e) => props.onInput?.(e.currentTarget.valueAsNumber)}
        onChange={(e) => props.onChange?.(e.currentTarget.valueAsNumber)}
        class="w-full accent-amber-600"
      />
    </label>
  );
}

