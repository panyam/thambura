import { onCleanup, onMount } from "solid-js";

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Values snap to multiples of this from `min`. */
  step?: number;
  onChange(value: number): void;
  /** What a screen reader announces for a value, e.g. "C, 1 kattai". */
  format?(value: number): string;
  /** Pixel diameter. */
  size?: number;
}

// Drag distance, in px, for the full range.
const DRAG_RANGE = 160;
// The pointer sweeps 270°, from 7 o'clock to 5 o'clock.
const SWEEP = 270;

/**
 * A rotary knob in the style of an old electronic tambura: black cap, white
 * pointer, a metal skirt with ticks. Turn it by dragging up and down, with the
 * wheel, or with the arrow keys (PageUp/PageDown for big steps, Home/End for
 * the ends). It is a `role="slider"` to assistive tech.
 */
export function Knob(props: KnobProps) {
  let el!: HTMLDivElement;
  const step = () => props.step ?? 1;
  const size = () => props.size ?? 56;
  const snap = (v: number) => {
    const n = Math.round((v - props.min) / step()) * step() + props.min;
    return Math.min(props.max, Math.max(props.min, Number(n.toFixed(6))));
  };
  const emit = (v: number) => {
    const next = snap(v);
    if (next !== props.value) props.onChange(next);
  };
  const angle = () => -SWEEP / 2 + (SWEEP * (props.value - props.min)) / (props.max - props.min || 1);

  let drag: { y: number; value: number } | null = null;
  const onPointerDown = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    el.focus();
    drag = { y: e.clientY, value: props.value };
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    emit(drag.value + ((drag.y - e.clientY) / DRAG_RANGE) * (props.max - props.min));
  };
  const onPointerUp = () => {
    drag = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const big = Math.max(step(), (props.max - props.min) / 10);
    const moves: Record<string, number> = {
      ArrowUp: step(),
      ArrowRight: step(),
      ArrowDown: -step(),
      ArrowLeft: -step(),
      PageUp: big,
      PageDown: -big,
    };
    if (e.key in moves) emit(props.value + moves[e.key]);
    else if (e.key === "Home") emit(props.min);
    else if (e.key === "End") emit(props.max);
    else return;
    e.preventDefault();
  };

  onMount(() => {
    // Wheel listeners must be non-passive to stop the page scrolling.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      emit(props.value + (e.deltaY < 0 ? step() : -step()));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    onCleanup(() => el.removeEventListener("wheel", onWheel));
  });

  return (
    <div class="flex flex-col items-center gap-1.5">
      <div
        ref={el}
        role="slider"
        tabIndex={0}
        aria-label={props.label}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        aria-valuenow={props.value}
        aria-valuetext={props.format?.(props.value)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        class="relative cursor-grab touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900 active:cursor-grabbing"
        style={{ width: `${size()}px`, height: `${size()}px` }}
      >
        {/* Skirt: brushed metal with tick marks. */}
        <div
          class="absolute inset-0 rounded-full"
          style={{
            background:
              "repeating-conic-gradient(from -135deg, rgba(0,0,0,.55) 0 1.2deg, transparent 1.2deg 27deg) , radial-gradient(circle at 35% 30%, #e7e5e4, #78716c 70%, #44403c)",
            "box-shadow": "0 3px 6px rgba(0,0,0,.6), inset 0 1px 1px rgba(255,255,255,.4)",
          }}
        />
        {/* Cap, turned to the value. */}
        <div
          class="absolute rounded-full"
          style={{
            inset: "14%",
            background: "radial-gradient(circle at 35% 30%, #57534e, #0c0a09 70%)",
            "box-shadow": "0 2px 3px rgba(0,0,0,.7), inset 0 1px 1px rgba(255,255,255,.15)",
            transform: `rotate(${angle()}deg)`,
          }}
        >
          <div class="absolute left-1/2 top-[8%] h-[34%] w-[3px] -translate-x-1/2 rounded-full bg-stone-100" />
        </div>
      </div>
      <span class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-300">{props.label}</span>
    </div>
  );
}
