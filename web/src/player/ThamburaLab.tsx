import { createSignal, For, Show } from "solid-js";
import { MAX_CYCLE, MIN_CYCLE, stringLabels, THAMBURA_MODES, type ThamburaMode } from "../engine/shruthi";
import { ATTACK_LEVEL } from "../engine/tambura";
import {
  FIELD_SPECS,
  normalizePlan,
  readField,
  setGap,
  writeField,
  type FieldSpec,
  type ThamburaPlan,
} from "../engine/thamburaPlan";
import { Segmented, SELECT, SMALL_BUTTON, type ThamburaViewProps } from "./thamburaControls";
import { ThamburaMini } from "./ThamburaMini";

// The plucked modes the Custom plan can start from.
const SOURCES: ThamburaMode[] = ["jawari", "tambura", "guitar"];
const GROUPS: { id: FieldSpec["group"]; title: string; note?: string }[] = [
  { id: "pluck", title: "Pluck" },
  { id: "ring", title: "Ring" },
  { id: "tone", title: "Tone" },
  { id: "bloom", title: "Jawari bloom", note: "The Tambura voice's model. Bloom 0 turns it off." },
  { id: "place", title: "Place" },
];
const GAP_LABELS = ["After the first string", "After Sa 1", "After Sa 2", "After the low Sa"];

/**
 * A workbench for the plucked sound: every number in the Custom mode's plan,
 * string by string, to tune by ear. Loading a mode copies its plan, so the
 * Lab starts from a sound you know. Any change switches the Sound to Custom
 * so it is heard at once. The plan copies out as JSON, for render-mix
 * --custom (docs/sound-analysis.md) or to paste back in later.
 */
export function ThamburaLab(props: ThamburaViewProps) {
  const st = () => props.state();
  const s = () => st().settings;
  const plan = () => st().custom;
  const a = props.actions;
  const [tab, setTab] = createSignal(0);
  const [source, setSource] = createSignal<ThamburaMode>("jawari");
  const [pasted, setPasted] = createSignal("");
  const [note, setNote] = createSignal("");
  const labels = () => {
    const l = stringLabels(s());
    return [`1 · ${l[0]}`, "2 · Sa", "3 · Sa", "4 · low Sa"];
  };
  const modeLabel = (m: ThamburaMode) => THAMBURA_MODES.find((x) => x.id === m)?.label ?? m;
  const json = () => JSON.stringify(plan(), null, 1);

  const commit = (next: ThamburaPlan) => a.setCustom(next);
  const setField = (spec: FieldSpec, shown: number) => {
    const p = plan();
    const value = spec.fromDisplay ? spec.fromDisplay(shown) : shown;
    const strings = [...p.strings] as ThamburaPlan["strings"];
    strings[tab()] = writeField(strings[tab()], spec.field, value);
    commit({ ...p, strings });
  };
  const copyToAll = () => {
    const p = plan();
    const from = p.strings[tab()];
    // Level, place and detune stay each string's own; the sound is copied.
    const strings = p.strings.map((t) => ({ ...from, level: t.level, pan: t.pan, detune: t.detune })) as ThamburaPlan["strings"];
    commit({ ...p, strings });
  };
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json());
      setNote("Copied the settings.");
    } catch {
      setNote("Couldn't reach the clipboard; copy them from the box below.");
    }
  };
  const loadJson = () => {
    try {
      commit(normalizePlan(JSON.parse(pasted()), plan()));
      setNote("Loaded the pasted settings.");
    } catch {
      setNote("That isn't settings JSON.");
    }
  };

  return (
    <div class="grid gap-4">
      <ThamburaMini state={props.state} actions={a} />
      <LabSlider
        label="Speed"
        help="Seconds for one round of four plucks."
        unit="s round"
        min={MIN_CYCLE}
        max={MAX_CYCLE}
        step={0.1}
        value={s().cycleSeconds}
        onCommit={(cycleSeconds) => a.set({ cycleSeconds })}
      />

      <div class="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
        <span class="font-medium">Start from</span>
        <select aria-label="Start from" class={SELECT} onChange={(e) => setSource(e.currentTarget.value as ThamburaMode)}>
          <For each={SOURCES}>{(m) => <option value={m} selected={m === source()}>{modeLabel(m)}</option>}</For>
        </select>
        <button type="button" class={`${SMALL_BUTTON} w-auto px-3 text-sm`} onClick={() => a.loadCustom(source())}>
          Load
        </button>
        <button type="button" class={`${SMALL_BUTTON} ml-auto w-auto px-3 text-sm`} onClick={() => void copyJson()}>
          Copy settings
        </button>
      </div>
      <p class="-mt-2 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
        <Show when={s().mode !== "custom"} fallback={note() || "Playing Custom: what you hear is what's below."}>
          Playing {modeLabel(s().mode)}. Changing anything here switches the Sound to Custom.
        </Show>{" "}
        Loading uses the current tone {s().tone}, pluck {s().pluck}, sustain {s().sustain} and {s().voice} voice.
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <Segmented
          label="String"
          size="sm"
          value={String(tab())}
          options={labels().map((label, i) => ({ value: String(i), label }))}
          onChange={(v) => setTab(Number(v))}
        />
        <button type="button" class={`${SMALL_BUTTON} h-8 w-auto px-2.5 text-xs font-medium`} onClick={copyToAll}>
          Copy to all strings
        </button>
      </div>

      <div class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <For each={GROUPS}>
          {(g) => (
            <fieldset class="grid content-start gap-3">
              <legend class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{g.title}</legend>
              <Show when={g.note}>
                <p class="-mt-2 text-xs text-gray-500 dark:text-gray-400">{g.note}</p>
              </Show>
              <For each={FIELD_SPECS.filter((f) => f.group === g.id)}>
                {(spec) => <FieldSlider spec={spec} plan={plan()} string={tab()} onCommit={(v) => setField(spec, v)} />}
              </For>
              <Show when={g.id === "bloom"}>
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    checked={plan().strings[tab()].voice.attackLevel > 0}
                    onChange={(e) => {
                      const p = plan();
                      const strings = [...p.strings] as ThamburaPlan["strings"];
                      const t = strings[tab()];
                      strings[tab()] = { ...t, voice: { ...t.voice, attackLevel: e.currentTarget.checked ? ATTACK_LEVEL : 0 } };
                      commit({ ...p, strings });
                    }}
                  />
                  <span>
                    Scale by the attack <span class="text-xs text-gray-500 dark:text-gray-400">(else by the peak, which quietens a big bloom's attack)</span>
                  </span>
                </label>
              </Show>
            </fieldset>
          )}
        </For>
        <details class="sm:col-span-2">
          <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Classic resonance sweep
          </summary>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">The Tambura (classic) and Guitar model. Sweep gain 0 turns it off.</p>
          <div class="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <For each={FIELD_SPECS.filter((f) => f.group === "sweep")}>
              {(spec) => <FieldSlider spec={spec} plan={plan()} string={tab()} onCommit={(v) => setField(spec, v)} />}
            </For>
          </div>
        </details>
      </div>

      <fieldset class="grid gap-3 border-t border-gray-200 pt-3 sm:grid-cols-2 dark:border-gray-700">
        <legend class="mb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Rhythm, as shares of the round
        </legend>
        <For each={GAP_LABELS}>
          {(label, i) => (
            <LabSlider
              label={label}
              unit="%"
              min={5}
              max={85}
              step={0.5}
              value={plan().gaps[i()] * 100}
              onCommit={(v) => commit({ ...plan(), gaps: setGap(plan().gaps, i(), v / 100) })}
            />
          )}
        </For>
      </fieldset>

      <details class="border-t border-gray-200 pt-3 dark:border-gray-700">
        <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Settings JSON
        </summary>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          For <code>pnpm render-mix --modes custom --custom file.json</code>, or paste settings here to load them.
        </p>
        <textarea
          aria-label="Settings JSON"
          class="mt-2 h-40 w-full rounded-md border-gray-300 font-mono text-xs dark:border-gray-600 dark:bg-gray-800"
          value={json()}
          onInput={(e) => setPasted(e.currentTarget.value)}
        />
        <button type="button" class={`${SMALL_BUTTON} mt-2 w-auto px-3 text-sm`} onClick={loadJson} disabled={!pasted()}>
          Load these settings
        </button>
      </details>
    </div>
  );
}

/** One field of the selected string, in display units. */
function FieldSlider(props: { spec: FieldSpec; plan: ThamburaPlan; string: number; onCommit: (v: number) => void }) {
  const value = () => {
    const raw = readField(props.plan.strings[props.string], props.spec.field);
    return props.spec.display ? props.spec.display(raw) : raw;
  };
  return (
    <LabSlider
      label={props.spec.label}
      help={props.spec.help}
      unit={props.spec.unit}
      min={props.spec.min}
      max={props.spec.max}
      step={props.spec.step}
      value={value()}
      onCommit={props.onCommit}
    />
  );
}

/**
 * A slider whose readout follows the drag but which commits on release,
 * since most Lab changes re-render the plucks.
 */
function LabSlider(props: {
  label: string;
  help?: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = createSignal<number | null>(null);
  const shown = () => draft() ?? props.value;
  const decimals = () => Math.max(0, -Math.floor(Math.log10(props.step) + 1e-9));
  return (
    <label class="block" title={props.help}>
      <span class="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span class="font-medium">{props.label}</span>
        <span class="tabular-nums text-gray-500 dark:text-gray-400">
          {shown().toFixed(decimals())}
          {props.unit ? ` ${props.unit}` : ""}
        </span>
      </span>
      <input
        type="range"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={shown()}
        onInput={(e) => setDraft(e.currentTarget.valueAsNumber)}
        onChange={(e) => {
          props.onCommit(e.currentTarget.valueAsNumber);
          setDraft(null);
        }}
        class="w-full accent-amber-600"
      />
      <Show when={props.help}>
        <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{props.help}</span>
      </Show>
    </label>
  );
}
