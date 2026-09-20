import { createSignal, For, Show } from "solid-js";
import { MAX_CYCLE, MIN_CYCLE, stringLabels, THAMBURA_MODES, type ThamburaMode } from "../engine/shruthi";
import { ATTACK_LEVEL } from "../engine/tambura";
import {
  copyString,
  copyToAll,
  FIELD_SPECS,
  normalizePlan,
  readField,
  setGap,
  writeField,
  type FieldSpec,
  type ThamburaPlan,
} from "../engine/thamburaPlan";
import { BUILT_IN_PRESETS } from "../engine/presets";
import { copyText, SELECT, sharePresetUrl, SMALL_BUTTON, type ThamburaViewProps } from "./thamburaControls";
import type { ThamburaPreset } from "./thamburaPresenter";
import { ThamburaMini } from "./ThamburaMini";
import { ThamburaScope } from "./ThamburaScope";

// The plucked modes the Custom plan can start from.
const SOURCES: ThamburaMode[] = ["jawari", "tambura", "guitar"];
// The per-string groups, in reading order; they flow into as many columns as fit.
const GROUPS: { id: FieldSpec["group"]; title: string; note?: string }[] = [
  { id: "pluck", title: "Pluck" },
  { id: "ring", title: "Ring" },
  { id: "tone", title: "Tone" },
  { id: "bloom", title: "Jawari bloom", note: "The Tambura voice's model. Bloom 0 turns it off." },
  { id: "bloomTime", title: "Bloom timing" },
  { id: "place", title: "Place" },
];
const GAP_LABELS = ["After the first string", "After Sa 1", "After Sa 2", "After the low Sa"];
// Whether the Lab shows each control's description; a per-browser preference.
const HELP_KEY = "thambura.lab.descriptions";
const LEGEND = "mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";
const GROUP = "mb-5 grid break-inside-avoid content-start gap-2.5";

/**
 * A workbench for the plucked sound: every number in the Custom mode's plan,
 * string by string, to tune by ear. Loading a mode copies its plan, so the
 * Lab starts from a sound you know. Any change switches the Sound to Custom
 * so it is heard at once. Strings can be muted or soloed to hear one alone,
 * and a scope shows what's playing. The plan copies out as JSON, for
 * render-mix --custom (docs/sound-analysis.md) or to paste back in later.
 */
export function ThamburaLab(props: ThamburaViewProps) {
  const st = () => props.state();
  const s = () => st().settings;
  const plan = () => st().plan;
  const a = props.actions;
  const [tab, setTab] = createSignal(0);
  const [all, setAll] = createSignal(false);
  const [pasted, setPasted] = createSignal("");
  const [note, setNote] = createSignal("");
  const [help, setHelp] = createSignal(readHelp());
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
    const strings = p.strings.map((t, i) =>
      all() || i === tab() ? writeField(t, spec.field, value) : t,
    ) as ThamburaPlan["strings"];
    commit({ ...p, strings });
  };
  const copy = (choice: string) => {
    if (choice === "all") {
      commit(copyToAll(plan(), tab()));
      setNote(`Copied ${labels()[tab()]}'s sound to every string.`);
    } else if (choice) {
      const from = Number(choice);
      commit(copyString(plan(), from, tab()));
      setNote(`${labels()[tab()]} now has ${labels()[from]}'s sound.`);
    }
  };
  const soloed = () => st().muted.every((m, i) => m === (i !== tab()));
  const copyJson = async () => {
    setNote((await copyText(json())) ? "Copied the settings." : "Couldn't reach the clipboard; copy them from the box below.");
  };
  const loadJson = () => {
    try {
      commit(normalizePlan(JSON.parse(pasted()), plan()));
      setNote("Loaded the pasted settings.");
    } catch {
      setNote("That isn't settings JSON.");
    }
  };
  const toggleHelp = (on: boolean) => {
    setHelp(on);
    try {
      localStorage.setItem(HELP_KEY, on ? "1" : "0");
    } catch {
      // Just not remembered.
    }
  };
  const field = (spec: FieldSpec) => (
    <FieldSlider spec={spec} plan={plan()} string={tab()} help={help()} onCommit={(v) => setField(spec, v)} />
  );

  return (
    <div class="grid gap-4">
      <div class="grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ThamburaMini state={props.state} actions={a} />
        <LabSlider
          label="Speed"
          help="Seconds for one round of four plucks."
          showHelp={false}
          unit="s round"
          min={MIN_CYCLE}
          max={MAX_CYCLE}
          step={0.1}
          value={s().cycleSeconds}
          onCommit={(cycleSeconds) => a.set({ cycleSeconds })}
        />
      </div>

      <div class="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
        <p aria-live="polite">
          <Show
            when={s().mode === "custom"}
            fallback={`Playing ${modeLabel(s().mode)}. Changing anything here keeps its sound and carries on as Custom.`}
          >
            {note() || "Playing Custom: what you hear is what's below."}
          </Show>
        </p>
        <button type="button" class={`${SMALL_BUTTON} ml-auto w-auto px-3 text-sm`} onClick={() => void copyJson()}>
          Copy settings
        </button>
      </div>

      <Show when={props.analyser}>
        <ThamburaScope analyser={props.analyser!} playing={() => st().playing} />
      </Show>

      <div class="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="String" class="inline-flex flex-wrap rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
          <For each={labels()}>
            {(label, i) => (
              <div
                class={`flex items-center rounded-md ${
                  tab() === i() ? "bg-white shadow-sm dark:bg-gray-600" : ""
                }`}
              >
                <button
                  type="button"
                  aria-pressed={!st().muted[i()]}
                  aria-label={`${st().muted[i()] ? "Unmute" : "Mute"} string ${label}`}
                  title={st().muted[i()] ? "Muted: click to hear it" : "Playing: click to mute"}
                  onClick={() => a.setMuted(i(), !st().muted[i()])}
                  class="flex h-7 items-center rounded-md pl-2 pr-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <span
                    class={`h-2.5 w-2.5 rounded-full transition-shadow ${
                      st().muted[i()] ? "border border-gray-400 dark:border-gray-500" : "bg-amber-500"
                    } ${st().lit[i()] && !st().muted[i()] ? "ring-2 ring-amber-300" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={tab() === i()}
                  onClick={() => setTab(i())}
                  class={`h-7 rounded-md pl-1 pr-2.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    tab() === i() ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400"
                  } ${st().muted[i()] ? "line-through decoration-gray-400" : ""}`}
                >
                  {label}
                </button>
              </div>
            )}
          </For>
        </div>
        <button
          type="button"
          aria-pressed={soloed()}
          class={`${SMALL_BUTTON} h-8 w-auto px-2.5 text-xs font-medium ${soloed() ? "border-amber-500 text-amber-700 dark:text-amber-300" : ""}`}
          onClick={() => a.solo(tab())}
        >
          {soloed() ? "Unsolo" : "Solo"}
        </button>
        <label class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400" title="Move a control on every string at once.">
          <input
            type="checkbox"
            class="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            checked={all()}
            onChange={(e) => setAll(e.currentTarget.checked)}
          />
          All strings
        </label>
        <select
          aria-label="Copy"
          title="Copies the sound and damping; each string keeps its own level, pan and detune."
          class={`${SELECT} py-1 text-xs`}
          onChange={(e) => {
            copy(e.currentTarget.value);
            e.currentTarget.value = "";
          }}
        >
          <option value="" selected>
            Copy…
          </option>
          <For each={labels()}>{(l, i) => <Show when={i() !== tab()}><option value={String(i())}>Copy from {l}</option></Show>}</For>
          <option value="all">Copy this to all strings</option>
        </select>
        <label class="ml-auto flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            class="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            checked={help()}
            onChange={(e) => toggleHelp(e.currentTarget.checked)}
          />
          Show descriptions
        </label>
      </div>

      <div class="columns-1 gap-8 sm:columns-2 lg:columns-3 xl:columns-4">
        <For each={GROUPS}>
          {(g) => (
            <fieldset class={GROUP}>
              <legend class={LEGEND}>{g.title}</legend>
              <Show when={g.note && help()}>
                <p class="-mt-1 text-xs text-gray-500 dark:text-gray-400">{g.note}</p>
              </Show>
              <For each={FIELD_SPECS.filter((f) => f.group === g.id)}>{field}</For>
              <Show when={g.id === "bloom"}>
                <label class="flex items-start gap-2 text-sm" title="Else by the peak, which quietens a big bloom's attack.">
                  <input
                    type="checkbox"
                    class="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
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
                    Scale by the attack
                    <Show when={help()}>
                      <span class="block text-xs text-gray-500 dark:text-gray-400">Else by the peak, which quietens a big bloom's attack.</span>
                    </Show>
                  </span>
                </label>
              </Show>
            </fieldset>
          )}
        </For>
        <fieldset class={GROUP}>
          <legend class={LEGEND}>Rhythm, all strings</legend>
          <For each={GAP_LABELS}>
            {(label, i) => (
              <LabSlider
                label={label}
                help="The gap after this pluck, as a share of the round. The others adjust to keep the round."
                showHelp={help()}
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
        <details class={GROUP}>
          <summary class={`${LEGEND} cursor-pointer`}>Classic resonance sweep</summary>
          <Show when={help()}>
            <p class="text-xs text-gray-500 dark:text-gray-400">The Tambura (classic) and Guitar model. Sweep gain 0 turns it off.</p>
          </Show>
          <div class="mt-2 grid gap-2.5">
            <For each={FIELD_SPECS.filter((f) => f.group === "sweep")}>{field}</For>
          </div>
        </details>
      </div>

      <Presets {...props} />

      <details class="border-t border-gray-200 pt-3 dark:border-gray-700">
        <summary class={`${LEGEND} cursor-pointer`}>Settings JSON</summary>
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

function readHelp(): boolean {
  try {
    return localStorage.getItem(HELP_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Saved setups: save this one by name, and play, copy, offer to the project,
 * rename or delete each. A preset is a share link, so copying it gives the
 * link that plays it.
 */
function Presets(props: ThamburaViewProps) {
  const a = props.actions;
  const [name, setName] = createSignal("");
  const [status, setStatus] = createSignal("");
  const st = () => props.state();
  // Built-in presets show by name too, but only a saved one can be written over.
  const playing = () => [...st().presets, ...BUILT_IN_PRESETS].find((p) => p.id === st().presetId);
  const current = () => st().presets.find((p) => p.id === st().presetId);
  const saveAs = () => {
    const p = a.savePreset(name());
    setName("");
    setStatus(`Saved "${p.name}".`);
  };
  const save = () => {
    const p = a.updatePreset();
    if (p) setStatus(`Saved over "${p.name}".`);
  };
  const copy = async (p: ThamburaPreset) => {
    const ok = props.shareUrl && (await copyText(props.shareUrl(p.link)));
    setStatus(ok ? `Copied the link to "${p.name}".` : "Couldn't reach the clipboard.");
  };
  const rename = (p: ThamburaPreset) => {
    const next = window.prompt("Rename this preset", p.name);
    if (next !== null) a.renamePreset(p.id, next);
  };
  const remove = (p: ThamburaPreset) => {
    if (window.confirm(`Delete "${p.name}"?`)) a.deletePreset(p.id);
  };
  const small = `${SMALL_BUTTON} h-8 w-auto px-2.5 text-xs font-medium`;
  return (
    <fieldset class="grid gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
      <legend class="mb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Presets</legend>
      <form
        class="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveAs();
        }}
      >
        <input
          aria-label="Preset name"
          placeholder="Name this sound"
          class="min-w-0 flex-1 rounded-md border-gray-300 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        {/* Saving over a preset is its own button, so an edit can't quietly replace one. */}
        <button
          type="button"
          class={`${SMALL_BUTTON} w-auto px-3 text-sm disabled:opacity-40`}
          disabled={!current() || !st().edited}
          title={current() ? `Save over "${current()!.name}"` : "Pick a preset first, or save this as a new one"}
          onClick={save}
        >
          Save
        </button>
        <button type="submit" class={`${SMALL_BUTTON} w-auto px-3 text-sm`}>
          Save as…
        </button>
      </form>
      <p class="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
        {status() ||
          (playing()
            ? st().edited
              ? current()
                ? `Playing "${playing()!.name}", changed. Save writes over it; Save as… keeps both.`
                : `Playing "${playing()!.name}", changed. It ships with the app, so Save as… keeps your version.`
              : `Playing "${playing()!.name}".`
            : "Saved in this browser. Copy a preset's link to send it, or share it with the project on GitHub.")}
      </p>
      <ul class="grid gap-1.5">
        <For each={props.state().presets}>
          {(p) => (
            <li class="flex flex-wrap items-center gap-1.5 text-sm">
              <button
                type="button"
                class="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label={`Play preset ${p.name}`}
                onClick={() => a.applyPreset(p.id)}
              >
                {p.name}
              </button>
              <Show when={props.shareUrl}>
                <button type="button" class={small} onClick={() => void copy(p)}>
                  Copy link
                </button>
                <a class={`${small} no-underline`} href={sharePresetUrl(p.name, props.shareUrl!(p.link))} target="_blank" rel="noopener">
                  Share
                </a>
              </Show>
              <button type="button" class={small} onClick={() => rename(p)}>
                Rename
              </button>
              <button type="button" class={small} aria-label={`Delete preset ${p.name}`} onClick={() => remove(p)}>
                Delete
              </button>
            </li>
          )}
        </For>
      </ul>
    </fieldset>
  );
}

/** One field of the selected string, in display units. */
function FieldSlider(props: { spec: FieldSpec; plan: ThamburaPlan; string: number; help: boolean; onCommit: (v: number) => void }) {
  const value = () => {
    const raw = readField(props.plan.strings[props.string], props.spec.field);
    return props.spec.display ? props.spec.display(raw) : raw;
  };
  return (
    <LabSlider
      label={props.spec.label}
      help={props.spec.help}
      showHelp={props.help}
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
 * A compact slider: its label and value on one line, its description in the
 * label's tooltip, or under it when descriptions are shown. The readout
 * follows the drag but the value commits on release, since most Lab changes
 * re-render the plucks.
 */
function LabSlider(props: {
  label: string;
  help?: string;
  showHelp: boolean;
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
      <span class="flex items-baseline justify-between gap-2 text-sm leading-tight">
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
        class="h-5 w-full accent-amber-600"
      />
      <Show when={props.showHelp && props.help}>
        <span class="block text-xs leading-snug text-gray-500 dark:text-gray-400">{props.help}</span>
      </Show>
    </label>
  );
}
