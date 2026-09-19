import { For, type JSX } from "solid-js";
import {
  isTamburaMode,
  KEYS,
  MAX_CENTS,
  MAX_CYCLE,
  MIN_CYCLE,
  RAAGINI_CYCLE,
  type Swara,
  type ThamburaMode,
} from "../engine/shruthi";
import { Knob } from "./Knob";
import { centsLabel, keyOptionLabel, type ThamburaViewProps } from "./thamburaControls";

// Wood grain over a teak base, all gradients so no image is needed.
const WOOD =
  "repeating-linear-gradient(94deg, rgba(0,0,0,.09) 0 2px, transparent 2px 7px)," +
  "repeating-linear-gradient(86deg, rgba(255,255,255,.05) 0 1px, transparent 1px 13px)," +
  "linear-gradient(180deg, #8d4f27, #5a2d12)";
// The six-sided cabinet: a box with its top corners cut off.
const CABINET = "polygon(6% 0, 94% 0, 100% 16%, 100% 100%, 0 100%, 0 16%)";

const SELECT_LABELS: Record<string, string> = { Pa: "PA", Ma1: "MA", Ni3: "NI", Sa: "SA" };

/**
 * The thambura drawn as a 2000s Raagini electronic tanpura: a wooden cabinet,
 * a green LCD, Sa Main / Sa Fine / Tone / Tempo / Volume knobs, and the Select
 * button that steps the first string through Pa, Ma, Ni and Sa. It looks the
 * same in light and dark themes, being a physical box.
 */
export function ThamburaRaagini(props: ThamburaViewProps) {
  const st = () => props.state();
  const s = () => st().settings;
  const a = props.actions;

  return (
    <div class="mx-auto w-full max-w-xl select-none py-1">
      <div class="rounded-b-lg p-3 shadow-xl sm:p-4" style={{ background: WOOD, "clip-path": CABINET }}>
        <div
          class="rounded-md px-3 pb-4 pt-5 sm:px-5"
          style={{
            background: "linear-gradient(180deg, #292524, #0c0a09)",
            "box-shadow": "inset 0 2px 8px rgba(0,0,0,.85), 0 1px 0 rgba(255,255,255,.08)",
          }}
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-serif text-2xl tracking-[0.35em] text-amber-300" style={{ "text-shadow": "0 1px 0 #000" }}>
                RAAGINI
              </div>
              <div class="text-[9px] uppercase tracking-[0.3em] text-stone-400">Digital electronic tanpura</div>
            </div>
            <Lcd {...props} />
          </div>

          <div class="mt-5 grid grid-cols-3 justify-items-center gap-y-4 sm:grid-cols-5">
            <Knob
              label="Sa main"
              min={0}
              max={KEYS.length - 1}
              value={s().key}
              onChange={(key) => a.set({ key })}
              format={(k) => `${keyOptionLabel(k)} kattai`}
            />
            <Knob
              label="Sa fine"
              min={-MAX_CENTS}
              max={MAX_CENTS}
              value={s().cents}
              onChange={(cents) => a.set({ cents })}
              format={(c) => `${c} cents`}
            />
            <Knob
              label="Tone"
              min={0}
              max={1}
              value={s().voice === "ladies" ? 1 : 0}
              onChange={(v) => a.set({ voice: v === 1 ? "ladies" : "gents" })}
              format={(v) => (v === 1 ? "Ladies" : "Gents")}
            />
            <Knob
              label="Tempo"
              min={MIN_CYCLE}
              max={MAX_CYCLE}
              step={0.1}
              // Clockwise is faster, which is a shorter round.
              value={MIN_CYCLE + MAX_CYCLE - s().cycleSeconds}
              onChange={(v) => a.set({ cycleSeconds: MIN_CYCLE + MAX_CYCLE - v })}
              format={(v) => `${(MIN_CYCLE + MAX_CYCLE - v).toFixed(1)} seconds a round`}
            />
            <Knob label="Volume" min={0} max={100} value={s().volume} onChange={(volume) => a.set({ volume })} format={(v) => `${v}%`} />
          </div>

          <div class="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-stone-700/70 pt-4">
            <Power on={st().playing} onClick={() => void a.toggle()} />
            <div class="flex items-center gap-2" aria-hidden="true">
              <For each={[0, 1, 2, 3]}>
                {(i) => (
                  <Led on={s().mode === "sruti" ? st().playing : st().lit[i]} color="amber" label={String(i + 1)} />
                )}
              </For>
            </div>
            <ModeSwitch mode={s().mode} onChange={(mode) => a.set({ mode })} />
            <div class="flex items-center gap-3">
              <div class="grid grid-cols-2 gap-x-2 gap-y-1" aria-hidden="true">
                <For each={RAAGINI_CYCLE}>
                  {(sw: Swara) => <Led on={s().firstString === sw} color="red" label={SELECT_LABELS[sw]} />}
                </For>
              </div>
              <RubberButton label="Select" onClick={() => a.cycleFirstString()} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Kattai, key and fine tune on top; first string, mode and speed below. Backlit while playing. */
function Lcd(props: ThamburaViewProps) {
  const s = () => props.state().settings;
  const on = () => props.state().playing;
  const key = () => KEYS[s().key];
  return (
    <div
      role="status"
      aria-label={`${keyOptionLabel(s().key)}, ${centsLabel(s().cents)}, first string ${s().firstString}`}
      class="min-w-[11rem] rounded-sm border-2 border-stone-950 px-2.5 py-1.5 font-mono leading-tight transition-colors duration-300"
      style={{
        background: on() ? "#b5cc5a" : "#7d8c47",
        color: "#1d2610",
        "box-shadow": "inset 0 2px 5px rgba(0,0,0,.45)",
      }}
    >
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-2xl font-bold">{key().kattai}</span>
        <span class="text-lg">{key().note}{key().octave}</span>
        <span class="text-sm tabular-nums">{centsLabel(s().cents).replace("¢", "")}</span>
      </div>
      <div class="flex justify-between gap-3 text-[11px] uppercase tracking-wider">
        <span>{s().firstString}</span>
        <span>{s().mode === "sruti" ? "sruti" : `${LCD_MODES[s().mode]} ${s().cycleSeconds.toFixed(1)}s`}</span>
      </div>
    </div>
  );
}

function Led(props: { on: boolean; color: "red" | "amber"; label: string }) {
  const lit = () => (props.color === "red" ? "#ef4444" : "#fbbf24");
  const dim = () => (props.color === "red" ? "#450a0a" : "#422006");
  return (
    <span class="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-stone-400">
      <span
        class="h-2 w-2 rounded-full transition-all duration-100"
        style={{
          background: props.on ? lit() : dim(),
          "box-shadow": props.on ? `0 0 6px 1px ${lit()}` : "inset 0 1px 1px rgba(0,0,0,.6)",
        }}
      />
      {props.label}
    </span>
  );
}

function Power(props: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Power"
      aria-pressed={props.on}
      onClick={() => props.onClick()}
      class="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      <span
        class="relative h-7 w-12 rounded-sm border border-stone-950"
        style={{ background: "linear-gradient(180deg,#1c1917,#44403c)", "box-shadow": "inset 0 1px 3px rgba(0,0,0,.8)" }}
      >
        <span
          class="absolute top-0.5 h-5 w-5 rounded-sm transition-all duration-150"
          style={{
            left: props.on ? "calc(100% - 1.4rem)" : "0.15rem",
            background: "linear-gradient(180deg,#e7e5e4,#a8a29e)",
            "box-shadow": "0 1px 2px rgba(0,0,0,.7)",
          }}
        />
      </span>
      <Led on={props.on} color="red" label="POWER" />
    </button>
  );
}

// The plucked modes on the LCD, which tells the two tambura voices apart.
const LCD_MODES: Record<ThamburaMode, string> = { jawari: "tmb", tambura: "tmb c", guitar: "gtr", sruti: "sruti" };

// The switch's positions. Moving to TMB selects the classic voice, the default.
const MODES: { mode: ThamburaMode; label: string }[] = [
  { mode: "tambura", label: "TMB" },
  { mode: "guitar", label: "GTR" },
  { mode: "sruti", label: "SRUTI" },
];

/** The switch position showing `mode`: both tambura voices sit at TMB. */
function position(mode: ThamburaMode): number {
  return isTamburaMode(mode) ? 0 : Math.max(0, MODES.findIndex((m) => m.mode === mode));
}

/**
 * A three-position slide switch: tambura, guitar, sruti. Click a position's
 * label, or the slider to step along it. Either tambura voice lights TMB, and
 * clicking TMB there keeps the voice.
 */
function ModeSwitch(props: { mode: ThamburaMode; onChange: (mode: ThamburaMode) => void }) {
  const index = () => position(props.mode);
  return (
    <div role="radiogroup" aria-label="Sound" class="flex flex-col items-center gap-1">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => props.onChange(MODES[(index() + 1) % MODES.length].mode)}
        class="relative h-3 w-16 rounded-full bg-stone-950 shadow-inner"
      >
        <span
          class="absolute top-[-2px] h-4 w-4 rounded-full transition-all duration-150"
          style={{
            left: `calc(${index() * 50}% - ${index() * 0.5}rem)`,
            background: "radial-gradient(circle at 35% 30%,#f5f5f4,#78716c)",
          }}
        />
      </button>
      <div class="flex w-24 justify-between">
        {MODES.map((m, i) => (
          <button
            type="button"
            role="radio"
            aria-checked={index() === i}
            onClick={() => index() !== i && props.onChange(m.mode)}
            class={`rounded px-0.5 text-[9px] font-semibold tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              index() === i ? "text-stone-100" : "text-stone-500"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RubberButton(props: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      class="flex h-11 w-11 items-center justify-center rounded-full text-[9px] font-bold tracking-wider text-stone-200 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      style={{ background: "radial-gradient(circle at 40% 35%, #b91c1c, #450a0a)", "box-shadow": "0 3px 5px rgba(0,0,0,.7)" }}
    >
      {props.label.toUpperCase()}
    </button>
  );
}
