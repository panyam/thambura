import { For, Show, type Accessor, type JSX } from "solid-js";
import type { Gati } from "../engine/carnatic";
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
>;

/**
 * The tala player: beat image, transport, tempo and volume, and the tala
 * settings. Renders PlayerState and sends every change to the presenter.
 */
export function PlayerView(props: { state: Accessor<PlayerState>; actions: PlayerActions }) {
  const s = props.state;
  const a = props.actions;
  const tala = () => s().settings.tala;

  return (
    <div class="flex flex-col items-center gap-6">
      <Show when={s().status === "error"}>
        <p role="alert" class="w-full rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
          {s().error}
        </p>
      </Show>

      <section class="flex flex-col items-center gap-3">
        {/* The beat images are drawn for a white background, so the frame stays white in dark mode. */}
        <div class="flex h-64 w-64 items-center justify-center overflow-hidden rounded-xl border-2 border-gray-300 bg-white p-5 shadow-sm dark:border-gray-600">
          <Show when={s().image}>{(src) => <img src={src()} alt="" class="max-h-full max-w-full object-contain" />}</Show>
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

      <section class="flex flex-wrap items-center justify-center gap-2" aria-label="Transport">
        <Button onClick={() => a.restart()} disabled={s().status !== "ready"}>Restart</Button>
        <Button onClick={() => a.prev()} disabled={s().status !== "ready" || s().playing}>Prev</Button>
        <button
          type="button"
          onClick={() => void a.toggle()}
          disabled={s().status !== "ready"}
          class="min-w-24 rounded-md bg-amber-600 px-5 py-2 font-semibold text-white shadow-sm hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-gray-900"
        >
          {s().playing ? "Stop" : "Start"}
        </button>
        <Button onClick={() => a.next()} disabled={s().status !== "ready" || s().playing}>Next</Button>
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
          <input
            id="tempo"
            type="range"
            min={MIN_TEMPO}
            max={MAX_TEMPO}
            value={s().tempo}
            onInput={(e) => a.setTempo(e.currentTarget.valueAsNumber)}
            class="w-full accent-amber-600"
          />
        </div>
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label for="volume" class="text-sm font-medium">Volume</label>
            <span class="text-sm tabular-nums text-gray-500 dark:text-gray-400">{s().volume}%</span>
          </div>
          <input
            id="volume"
            type="range"
            min={0}
            max={100}
            value={s().volume}
            onInput={(e) => a.setVolume(e.currentTarget.valueAsNumber)}
            class="w-full accent-amber-600"
          />
        </div>
      </section>

      <section class="grid w-full max-w-md grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2" aria-label="Tala settings">
        <Field label="Thaala" id="tala">
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
        <Field label="Jaathi" id="jaathi" hint={usesJaathi(tala()) ? undefined : "Only sapta thaalas have a laghu"}>
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
        <Field label="Sounds" id="sounds">
          <select id="sounds" class={SELECT} onChange={(e) => void a.setSoundGroup(e.currentTarget.value)}>
            <For each={s().soundGroups}>{(g) => <option value={g} selected={g === s().soundGroup}>{g}</option>}</For>
          </select>
        </Field>
        <Field label="Images" id="images">
          <select id="images" class={SELECT} onChange={(e) => void a.setImageGroup(e.currentTarget.value)}>
            <For each={s().imageGroups}>{(g) => <option value={g} selected={g === s().imageGroup}>{g}</option>}</For>
          </select>
        </Field>
      </section>
    </div>
  );
}

const SELECT =
  "w-full rounded-md border-gray-300 bg-white py-1.5 text-sm text-gray-900 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

function Button(props: { onClick: () => void; disabled?: boolean; children: JSX.Element }) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      disabled={props.disabled}
      class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      {props.children}
    </button>
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
