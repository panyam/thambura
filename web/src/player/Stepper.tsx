import type { JSX } from "solid-js";

/** A slider with − and + buttons either side for single-step adjustment. */
export function Stepper(props: {
  label: string;
  unit: string;
  onDown: () => void;
  onUp: () => void;
  atMin: boolean;
  atMax: boolean;
  children: JSX.Element;
}) {
  const step = (dir: "Decrease" | "Increase", onClick: () => void, disabled: boolean, d: string) => (
    <button
      type="button"
      onClick={() => onClick()}
      disabled={disabled}
      aria-label={`${dir} ${props.label} by ${props.unit}`}
      title={`${dir} ${props.label} by ${props.unit}`}
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
        <path d={d} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </svg>
    </button>
  );
  return (
    <div class="flex items-center gap-3">
      {step("Decrease", props.onDown, props.atMin, "M5 12h14")}
      <div class="flex-1">{props.children}</div>
      {step("Increase", props.onUp, props.atMax, "M5 12h14M12 5v14")}
    </div>
  );
}
