import { For, onCleanup, type JSX } from "solid-js";
import { KEYS, tunedTonicHz, type ThamburaSettings } from "../engine/shruthi";
import type { ThamburaPresenter, ThamburaState } from "./thamburaPresenter";

/** What every thambura view may call. */
export type ThamburaActions = Pick<
  ThamburaPresenter,
  "toggle" | "set" | "nudgeCents" | "cycleFirstString" | "setView" | "setOpen" | "toggleOpen"
>;

export interface ThamburaViewProps {
  state: () => ThamburaState;
  actions: ThamburaActions;
}

/** "+12¢", "−3¢", "0¢". */
export function centsLabel(cents: number): string {
  return `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${Math.abs(cents)}¢`;
}

/** Sa with fine tune, "130.81 Hz". */
export function hzLabel(s: ThamburaSettings): string {
  return `${tunedTonicHz(s).toFixed(2)} Hz`;
}

/** "C3 · 1", with the octave so the two A, A# and B keys differ. */
export function keyOptionLabel(key: number): string {
  const k = KEYS[key];
  return `${k.note}${k.octave} · ${k.kattai}`;
}

export function PlayButton(props: { playing: boolean; onClick: () => void; class?: string }) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      aria-label={props.playing ? "Stop thambura" : "Start thambura"}
      aria-pressed={props.playing}
      class={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white shadow-sm hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${props.class ?? ""}`}
    >
      {props.playing ? (
        <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>
      ) : (
        <svg class="ml-0.5 h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>
      )}
    </button>
  );
}

/** A row of mutually exclusive buttons. */
export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const pad = () => (props.size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm");
  return (
    <div role="radiogroup" aria-label={props.label} class="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
      <For each={props.options}>
        {(o) => (
          <button
            type="button"
            role="radio"
            aria-checked={o.value === props.value}
            onClick={() => props.onChange(o.value)}
            class={`rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${pad()} ${
              o.value === props.value
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

/**
 * A button that repeats while held: once on press, then every 70 ms after
 * 400 ms. Keyboard presses fire once each, as with any button.
 */
export function RepeatButton(props: { label: string; onStep: () => void; class?: string; children: JSX.Element }) {
  let delay: ReturnType<typeof setTimeout> | undefined;
  let repeat: ReturnType<typeof setInterval> | undefined;
  const release = () => {
    clearTimeout(delay);
    clearInterval(repeat);
  };
  onCleanup(release);
  return (
    <button
      type="button"
      aria-label={props.label}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        props.onStep();
        release();
        delay = setTimeout(() => (repeat = setInterval(() => props.onStep(), 70)), 400);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      // Pointer presses are handled above; detail is 0 for Enter/Space.
      onClick={(e) => e.detail === 0 && props.onStep()}
      class={props.class}
    >
      {props.children}
    </button>
  );
}

export const SMALL_BUTTON =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-lg font-semibold text-gray-700 shadow-sm select-none touch-none hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700";

export const SELECT =
  "rounded-md border-gray-300 bg-white py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

export const SMALL_SELECT =
  "rounded-md border-gray-300 bg-white py-1 pl-2.5 text-xs font-medium text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";
