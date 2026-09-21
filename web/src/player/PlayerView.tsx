import { For, Show, type Accessor, type JSX } from "solid-js";
import type { Gati } from "../engine/carnatic";
import { MOTION_OPTIONS, REST, type BeatMotion, type BeatPose } from "../engine/motion";
import {
  GATI_OPTIONS,
  KALAI_OPTIONS,
  MAX_TEMPO,
  MIN_TEMPO,
  TALA_OPTIONS,
  usesJaathi,
  usesNadai,
  type TalaId,
} from "../engine/selection";
import type { KitState } from "./kitPresenter";
import { StrokePad, type KitActions } from "./StrokePad";
import type { PlayerPresenter, PlayerState } from "./presenter";

export type PlayerActions = Pick<
  PlayerPresenter,
  | "toggle"
  | "next"
  | "prev"
  | "restart"
  | "setTempo"
  | "setVolume"
  | "setSettings"
  | "setSoundGroup"
  | "setImageGroup"
  | "setMotion"
>;

/**
 * The tala player: beat image, transport, tempo and volume, and the tala
 * settings. Renders PlayerState and sends every change to the presenter.
 */
export function PlayerView(props: {
  state: Accessor<PlayerState>;
  pose?: Accessor<BeatPose>;
  actions: PlayerActions;
  /** A struck instrument, when the page has a kit for one. */
  kit?: { state: Accessor<KitState>; actions: KitActions };
}) {
  const s = props.state;
  const a = props.actions;
  const tala = () => s().settings.tala;
  const pose = () => props.pose?.() ?? REST;

  return (
    <div class="flex flex-col items-center gap-6">
      <Show when={s().status === "error"}>
        <p role="alert" class="w-full rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
          {s().error}
        </p>
      </Show>

      <section class="flex flex-col items-center gap-3">
        {/* The beat images are drawn for a white background, so the frame stays white in dark mode.
            The image moves with the beat (engine/motion.ts), unless the viewer asks for reduced motion. */}
        <div class="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-xl border-2 border-gray-300 bg-white p-5 shadow-sm dark:border-gray-600">
          <Show when={s().motion === "lift"}>
            <div
              aria-hidden="true"
              class="absolute bottom-3 left-1/2 h-3 w-28 rounded-[50%] bg-[radial-gradient(closest-side,rgba(17,24,39,0.28),transparent)] motion-reduce:!transform-none motion-reduce:!opacity-100"
              style={{ transform: `translateX(-50%) scale(${1 - 0.35 * pose().lift})`, opacity: 1 - 0.6 * pose().lift }}
            />
          </Show>
          <Show when={s().image}>
            {(src) => (
              <img
                src={src()}
                alt=""
                class="relative max-h-full max-w-full object-contain will-change-transform motion-reduce:!transform-none motion-reduce:!opacity-100"
                style={{
                  transform: `translateY(${(-16 * pose().lift).toFixed(2)}px) scale(${pose().scale})`,
                  opacity: pose().opacity,
                }}
              />
            )}
          </Show>
        </div>
        <p class="text-sm tabular-nums text-gray-500 dark:text-gray-400" aria-live="off">
          <Show when={s().beatCount > 0} fallback={<>&nbsp;</>}>
            Beat {s().position.beat + 1} of {s().beatCount}
            <Show when={s().settings.kalai > 1}>
              {" "}· repeat {s().position.repeat + 1} of {s().settings.kalai}
            </Show>
          </Show>
        </p>
      </section>

      {/* How the beat looks and sounds, next to the image it changes: a row of
          three, stacked on a phone so the choices' names fit. */}
      <section class="grid w-full max-w-md grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-3" aria-label="Display">
        <Field label="Animation" id="motion">
          <select id="motion" class={SELECT} onChange={(e) => a.setMotion(e.currentTarget.value as BeatMotion)}>
            <For each={MOTION_OPTIONS}>{(o) => <option value={o.id} selected={o.id === s().motion}>{o.label}</option>}</For>
          </select>
        </Field>
        <Field label="Images" id="images">
          <select id="images" class={SELECT} onChange={(e) => void a.setImageGroup(e.currentTarget.value)}>
            <For each={s().imageGroups}>{(g) => <option value={g} selected={g === s().imageGroup}>{g}</option>}</For>
          </select>
        </Field>
        <Field label="Sounds" id="sounds">
          <select id="sounds" class={SELECT} onChange={(e) => void a.setSoundGroup(e.currentTarget.value)}>
            <For each={s().soundGroups}>{(g) => <option value={g} selected={g === s().soundGroup}>{g}</option>}</For>
          </select>
        </Field>
      </section>

      <section class="flex items-center justify-center gap-3" aria-label="Transport">
        <IconButton label="Restart" onClick={() => a.restart()} disabled={s().status !== "ready"}>
          <path d="M6 5h2v14H6zM19 5v14l-10-7z" />
        </IconButton>
        <IconButton label="Previous beat" onClick={() => a.prev()} disabled={s().status !== "ready" || s().playing}>
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </IconButton>
        <button
          type="button"
          onClick={() => void a.toggle()}
          disabled={s().status !== "ready"}
          aria-label={s().playing ? "Stop" : "Start"}
          title={s().playing ? "Stop" : "Start"}
          class="flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white shadow-sm hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-gray-900"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-7 w-7" aria-hidden="true">
            <Show when={s().playing} fallback={<path d="M8 5v14l11-7z" />}>
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </Show>
          </svg>
        </button>
        <IconButton label="Next beat" onClick={() => a.next()} disabled={s().status !== "ready" || s().playing}>
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </IconButton>
      </section>

      <section class="grid w-full max-w-md gap-4">
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label for="tempo" class="text-sm font-medium">Tempo</label>
            <span class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <input
                type="number"
                aria-label="Tempo in beats per minute"
                min={MIN_TEMPO}
                max={MAX_TEMPO}
                value={s().tempo}
                onChange={(e) => {
                  a.setTempo(e.currentTarget.valueAsNumber);
                  e.currentTarget.value = String(s().tempo); // show the clamped value
                }}
                class="w-20 rounded-md border-gray-300 bg-white py-1 text-right text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              bpm
            </span>
          </div>
          <Stepper
            label="tempo"
            unit="1 bpm"
            onDown={() => a.setTempo(s().tempo - TEMPO_STEP)}
            onUp={() => a.setTempo(s().tempo + TEMPO_STEP)}
            atMin={s().tempo <= MIN_TEMPO}
            atMax={s().tempo >= MAX_TEMPO}
          >
            <input
              id="tempo"
              type="range"
              min={MIN_TEMPO}
              max={MAX_TEMPO}
              value={s().tempo}
              onInput={(e) => a.setTempo(e.currentTarget.valueAsNumber)}
              class="w-full accent-amber-600"
            />
          </Stepper>
        </div>
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label for="volume" class="text-sm font-medium">Volume</label>
            <span class="text-sm tabular-nums text-gray-500 dark:text-gray-400">{s().volume}%</span>
          </div>
          <Stepper
            label="volume"
            unit={`${VOLUME_STEP}%`}
            onDown={() => a.setVolume(s().volume - VOLUME_STEP)}
            onUp={() => a.setVolume(s().volume + VOLUME_STEP)}
            atMin={s().volume <= 0}
            atMax={s().volume >= 100}
          >
            <input
              id="volume"
              type="range"
              min={0}
              max={100}
              value={s().volume}
              onInput={(e) => a.setVolume(e.currentTarget.valueAsNumber)}
              class="w-full accent-amber-600"
            />
          </Stepper>
        </div>
      </section>

      <section class="grid w-full max-w-md grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2" aria-label="Tala settings">
        <Field label="Tala" id="tala">
          <select
            id="tala"
            class={SELECT}
            onChange={(e) => a.setSettings({ tala: e.currentTarget.value as TalaId })}
          >
            <For each={TALA_OPTIONS}>
              {(group) => (
                <optgroup label={group.label}>
                  <For each={group.options}>
                    {(o) => <option value={o.value} selected={o.value === tala()}>{o.label}</option>}
                  </For>
                </optgroup>
              )}
            </For>
          </select>
        </Field>
        <Field label="Kalai" id="kalai">
          <select
            id="kalai"
            class={SELECT}
            onChange={(e) => a.setSettings({ kalai: Number(e.currentTarget.value) })}
          >
            <For each={KALAI_OPTIONS}>
              {(o) => <option value={o.value} selected={o.value === s().settings.kalai}>{o.label}</option>}
            </For>
          </select>
        </Field>
        <Field label="Jaathi" id="jaathi" hint={usesJaathi(tala()) ? undefined : "Only sapta talas have a laghu"}>
          <GatiSelect
            id="jaathi"
            value={s().settings.jaathi}
            disabled={!usesJaathi(tala())}
            onChange={(jaathi) => a.setSettings({ jaathi })}
          />
        </Field>
        <Field label="Gathi / Nadai" id="nadai" hint={usesNadai(tala()) ? undefined : "A chaapu sets its own gathi"}>
          <GatiSelect
            id="nadai"
            value={s().settings.nadai}
            disabled={!usesNadai(tala())}
            onChange={(nadai) => a.setSettings({ nadai })}
          />
        </Field>
      </section>

      <Show when={props.kit} keyed>
        {(k) => <StrokePad state={k.state} actions={k.actions} />}
      </Show>
    </div>
  );
}

const SELECT =
  "w-full rounded-md border-gray-300 bg-white py-1.5 text-sm text-gray-900 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

const TEMPO_STEP = 1;
const VOLUME_STEP = 5;

/** A round icon button; `label` is its accessible name and tooltip. */
function IconButton(props: { label: string; onClick: () => void; disabled?: boolean; children: JSX.Element }) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      class="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5" aria-hidden="true">
        {props.children}
      </svg>
    </button>
  );
}

/** A slider with − and + buttons either side for single-step adjustment. */
function Stepper(props: {
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

function Field(props: { label: string; id: string; hint?: string; children: JSX.Element }) {
  return (
    <div>
      <label for={props.id} class="mb-1 block text-sm font-medium">
        {props.label}
      </label>
      {props.children}
      <Show when={props.hint}>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{props.hint}</p>
      </Show>
    </div>
  );
}

function GatiSelect(props: { id: string; value: Gati; disabled: boolean; onChange: (g: Gati) => void }) {
  return (
    <select
      id={props.id}
      class={SELECT}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.currentTarget.value as Gati)}
    >
      <For each={GATI_OPTIONS}>
        {(o) => <option value={o.value} selected={o.value === props.value}>{o.label}</option>}
      </For>
    </select>
  );
}
