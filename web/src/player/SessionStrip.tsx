import { createSignal, For, Show, type Accessor } from "solid-js";
import { MAX_TEMPO, MIN_TEMPO } from "../engine/selection";
import { KEYS, keyName, MAX_CENTS } from "../engine/shruthi";
import type { SessionPresenter, SessionState } from "./session";
import { Stepper } from "./Stepper";

export type SessionActions = Pick<
  SessionPresenter,
  "setTempo" | "nudgeTempo" | "setKey" | "stepKey" | "setCents" | "nudgeCents" | "toggleAll" | "stretchedIn"
>;

/**
 * The page's speed and shruthi in one strip (#101). The shruthi reads like
 * iTanpura's: the note in a display between semitone arrows, and a fine
 * tune under it between flat and sharp. Tapping the note opens every key at
 * once, marked where a kit on the page would sound stretched.
 */
export function SessionStrip(props: { state: Accessor<SessionState>; actions: SessionActions }) {
  const s = props.state;
  const a = props.actions;
  const [picking, setPicking] = createSignal(false);
  const key = () => KEYS[s().pitch.key];
  const cents = () => s().pitch.cents;

  return (
    <section class="grid w-full max-w-md gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700" aria-label="Speed and shruthi">
      <Show when={s().tempo !== null}>
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label for="tempo" class="text-sm font-medium">Speed</label>
            <span class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <input
                type="number"
                aria-label="Tempo in beats per minute"
                min={MIN_TEMPO}
                max={MAX_TEMPO}
                value={s().tempo ?? ""}
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
            onDown={() => a.nudgeTempo(-1)}
            onUp={() => a.nudgeTempo(1)}
            atMin={(s().tempo ?? 0) <= MIN_TEMPO}
            atMax={(s().tempo ?? 0) >= MAX_TEMPO}
          >
            <input
              id="tempo"
              type="range"
              min={MIN_TEMPO}
              max={MAX_TEMPO}
              value={s().tempo ?? MIN_TEMPO}
              onInput={(e) => a.setTempo(e.currentTarget.valueAsNumber)}
              class="w-full accent-amber-600"
            />
          </Stepper>
        </div>
      </Show>

      <div>
        <div class="mb-1 flex items-center justify-between">
          <span class="text-sm font-medium" id="shruthi-label">Shruthi</span>
          <button
            type="button"
            onClick={() => void a.toggleAll()}
            aria-pressed={s().playing}
            title={s().playing ? "Stop everything (Space)" : "Start the tala and the thambura together (Space)"}
            class="rounded-full border border-amber-600 px-3 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 aria-pressed:bg-amber-600 aria-pressed:text-white dark:text-amber-400 dark:hover:bg-amber-950 dark:aria-pressed:text-white"
          >
            {s().playing ? "Stop all" : "Start all"}
          </button>
        </div>
        <div class="flex items-center justify-center gap-3">
          <Arrow label="Shruthi down a semitone" onClick={() => a.stepKey(-1)} disabled={s().pitch.key <= 0} d="M6 9l6 6 6-6" />
          <button
            type="button"
            onClick={() => setPicking(!picking())}
            aria-expanded={picking()}
            aria-controls="shruthi-keys"
            aria-label={`Shruthi ${keyName(s().pitch.key)}, kattai ${key().kattai}. Pick another`}
            title="Pick another shruthi"
            class="flex min-w-[8.5rem] items-baseline justify-center gap-2 rounded-lg border-2 border-gray-800 bg-gray-900 px-4 py-2 font-mono text-amber-400 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-gray-600"
          >
            <span class="text-3xl font-bold">{key().note}</span>
            <span class="text-sm">{key().octave}</span>
            <span class="text-lg text-amber-200/80">· {key().kattai}</span>
          </button>
          <Arrow label="Shruthi up a semitone" onClick={() => a.stepKey(1)} disabled={s().pitch.key >= KEYS.length - 1} d="M6 15l6-6 6 6" />
        </div>

        <Show when={picking()}>
          <div id="shruthi-keys" role="group" aria-labelledby="shruthi-label" class="mt-3 grid grid-cols-5 gap-1.5">
            <For each={KEYS}>
              {(k, i) => {
                const stretched = a.stretchedIn(i());
                const current = () => i() === s().pitch.key;
                return (
                  <button
                    type="button"
                    aria-pressed={current()}
                    title={stretched.length ? `${stretched.join(", ")} would sound stretched here` : undefined}
                    onClick={() => {
                      a.setKey(i());
                      setPicking(false);
                    }}
                    class="relative flex flex-col items-center rounded-md border border-gray-300 py-1 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 aria-pressed:border-amber-600 aria-pressed:bg-amber-600 aria-pressed:text-white dark:border-gray-600 dark:hover:bg-gray-800"
                  >
                    <span class="font-semibold">
                      {k.note}
                      <sub>{k.octave}</sub>
                    </span>
                    <span class="text-xs opacity-75">{k.kattai}</span>
                    <Show when={stretched.length > 0}>
                      <span class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="stretched" />
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>

        <div class="mt-3 flex items-center gap-3">
          <Arrow label="Fine tune down a cent" onClick={() => a.nudgeCents(-1)} disabled={cents() <= -MAX_CENTS} text="♭" />
          <input
            type="range"
            aria-label="Fine tune in cents"
            min={-MAX_CENTS}
            max={MAX_CENTS}
            value={cents()}
            onInput={(e) => a.setCents(e.currentTarget.valueAsNumber)}
            class="w-full accent-amber-600"
          />
          <Arrow label="Fine tune up a cent" onClick={() => a.nudgeCents(1)} disabled={cents() >= MAX_CENTS} text="♯" />
          <span class="w-12 shrink-0 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
            {cents() > 0 ? "+" : ""}
            {cents()}¢
          </span>
        </div>
      </div>
    </section>
  );
}

/** A square button with an arrow path or a symbol. */
function Arrow(props: { label: string; onClick: () => void; disabled: boolean; d?: string; text?: string }) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      <Show when={props.d} fallback={props.text}>
        <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
          <path d={props.d} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </Show>
    </button>
  );
}
