import { createSignal, For, Match, Show, Switch, type Accessor, type JSX } from "solid-js";
import { VARIETY_OPTIONS, type Variety } from "../engine/arrangement";
import { RAAGINI_CYCLE, THAMBURA_MODES, type Swara } from "../engine/shruthi";
import type { HandsPresenter, HandsState } from "./handsPresenter";
import type { KitPresenter, KitState } from "./kitPresenter";
import { StrokePad } from "./StrokePad";
import { PlayButton, Segmented, SMALL_SELECT } from "./thamburaControls";
import { ThamburaDocked } from "./ThamburaPanel";
import type { ThamburaPresenter, ThamburaState } from "./thamburaPresenter";
import type { Addable, TrackList, TrackListState, TrackRow } from "./trackList";

/** An instrument's state and intents, for its card. */
export type TrackInstrument =
  | { kind: "hands"; state: Accessor<HandsState>; actions: HandsPresenter }
  | { kind: "thambura"; state: Accessor<ThamburaState>; actions: ThamburaPresenter }
  | { kind: "kit"; state: Accessor<KitState>; actions: KitPresenter };

export interface TrackListViewProps {
  state: Accessor<TrackListState>;
  actions: Pick<TrackList<unknown>, "add" | "remove" | "undoRemove" | "setMuted" | "setSoloed">;
  /** The instrument behind a row, for its controls. */
  instrument(id: string): TrackInstrument | undefined;
  /** What each of the page's kits is called, by its index among them, once known. */
  kitNames: Accessor<string[]>;
  shareUrl?: (id: string, link: string) => string;
  analyser?: (id: string) => AnalyserNode | null;
}

/**
 * The instruments on the page as cards (#101): one column on a phone, a
 * grid of two or three from `lg` up. Each card shows the instrument's name,
 * its main controls, level, mute and solo; "More" opens its whole panel.
 * Add offers what can go on the page now, and a removed instrument can be
 * brought back from the note that follows.
 */
export function TrackListView(props: TrackListViewProps) {
  const s = props.state;
  const label = (a: Addable) => (a.kind === "thambura" ? "Thambura" : a.kind === "hands" ? "Claps" : props.kitNames()[a.kit ?? 0] || `Kit ${(a.kit ?? 0) + 1}`);
  return (
    <section aria-label="Instruments" class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Instruments</h2>
        <Show when={s().addable.length > 0}>
          <select
            aria-label="Add an instrument"
            class={SMALL_SELECT}
            onChange={(e) => {
              const i = Number(e.currentTarget.value);
              e.currentTarget.value = "";
              const what = s().addable[i];
              if (what) props.actions.add(what);
            }}
          >
            <option value="">+ Add</option>
            <For each={s().addable}>{(a, i) => <option value={i()}>{label(a)}</option>}</For>
          </select>
        </Show>
      </div>

      <Show when={s().removed}>
        {(removed) => (
          <div role="status" class="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm text-white dark:bg-gray-700">
            <span>Removed {nameOf(removed(), props)}.</span>
            <button type="button" class="font-semibold text-amber-400 hover:text-amber-300" onClick={() => props.actions.undoRemove()}>
              Undo
            </button>
          </div>
        )}
      </Show>

      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        <For each={s().rows}>{(row) => <TrackCard row={row} {...props} />}</For>
      </div>
    </section>
  );
}

function nameOf(row: { id: string; kind: string; kit?: number }, props: TrackListViewProps): string {
  if (row.kind === "hands") return "Claps";
  if (row.kind === "thambura") return "Thambura";
  const inst = props.instrument(row.id);
  const loaded = inst?.kind === "kit" ? inst.state().instrument : "";
  return capitalize(loaded || props.kitNames()[row.kit ?? 0] || "Kit");
}

function TrackCard(props: TrackListViewProps & { row: TrackRow }) {
  const [more, setMore] = createSignal(false);
  const row = () => props.row;
  const inst = () => props.instrument(row().id);
  const name = () => nameOf(row(), props);
  return (
    <article
      aria-label={name()}
      class={`flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm dark:bg-gray-900 ${
        more() ? "xl:col-span-2 2xl:col-span-3" : ""
      } ${row().soloed ? "border-amber-500" : "border-gray-200 dark:border-gray-700"}`}
    >
      <header class="flex items-center gap-2">
        <span
          aria-hidden="true"
          class={`h-2.5 w-2.5 shrink-0 rounded-full ${sounding(inst()) && !row().muted ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
        />
        <h3 class="min-w-0 flex-1 truncate font-semibold">{name()}</h3>
        <Toggle label={`Mute ${name()}`} short="M" on={row().muted} onClick={() => props.actions.setMuted(row().id, !row().muted)} />
        <Toggle label={`Solo ${name()}`} short="S" on={row().soloed} onClick={() => props.actions.setSoloed(row().id, !row().soloed)} />
        <Show when={row().removable}>
          <button
            type="button"
            aria-label={`Remove ${name()}`}
            title={`Remove ${name()}`}
            onClick={() => props.actions.remove(row().id)}
            class="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </Show>
      </header>

      <Show when={inst()}>
        {(i) => (
          <Switch>
            <Match when={i().kind === "thambura" && (i() as Extract<TrackInstrument, { kind: "thambura" }>)}>
              {(t) => (
                <>
                  <ThamburaQuick t={t()} />
                  <Show when={more()}>
                    <ThamburaDocked
                      compact
                      state={t().state}
                      actions={t().actions}
                      shareUrl={props.shareUrl && ((link) => props.shareUrl!(row().id, link))}
                      analyser={props.analyser && (() => props.analyser!(row().id))}
                    />
                  </Show>
                </>
              )}
            </Match>
            <Match when={i().kind === "kit" && (i() as Extract<TrackInstrument, { kind: "kit" }>)}>
              {(k) => (
                <>
                  <KitQuick k={k()} />
                  <Show when={more()}>
                    <StrokePad state={k().state} actions={k().actions} />
                  </Show>
                </>
              )}
            </Match>
            <Match when={i().kind === "hands" && (i() as Extract<TrackInstrument, { kind: "hands" }>)}>
              {(h) => <HandsQuick h={h()} />}
            </Match>
          </Switch>
        )}
      </Show>

      <Show when={row().kind !== "hands"}>
        <button
          type="button"
          aria-expanded={more()}
          onClick={() => setMore(!more())}
          class="self-start text-xs font-medium text-amber-700 hover:text-amber-600 dark:text-amber-400"
        >
          {more() ? "Less" : row().kind === "thambura" ? "More: views, Lab and presets" : "More: the pad"}
        </button>
      </Show>
    </article>
  );
}

/** Whether an instrument is making sound: the thambura playing, a kit switched on. The claps follow the tala. */
function sounding(i: TrackInstrument | undefined): boolean {
  if (!i) return false;
  if (i.kind === "thambura") return i.state().playing;
  if (i.kind === "kit") return i.state().enabled && i.state().status === "ready";
  return i.state().status === "ready";
}

function ThamburaQuick(props: { t: Extract<TrackInstrument, { kind: "thambura" }> }) {
  const s = () => props.t.state();
  const a = props.t.actions;
  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <PlayButton playing={s().playing} onClick={() => void a.toggle()} />
        <select aria-label="Sound" class={SMALL_SELECT} onChange={(e) => a.playMode(e.currentTarget.value as ThamburaState["settings"]["mode"])}>
          <For each={THAMBURA_MODES}>{(m) => <option value={m.id} selected={m.id === s().settings.mode}>{m.label}</option>}</For>
        </select>
        <Segmented
          label="First string"
          size="sm"
          value={s().settings.firstString}
          options={RAAGINI_CYCLE.map((sw) => ({ value: sw, label: sw.replace(/\d$/, "") }))}
          onChange={(firstString: Swara) => a.set({ firstString })}
        />
      </div>
      <Level label="Thambura level" value={s().settings.volume} onInput={(volume) => a.set({ volume })} />
    </div>
  );
}

function KitQuick(props: { k: Extract<TrackInstrument, { kind: "kit" }> }) {
  const s = () => props.k.state();
  const a = props.k.actions;
  return (
    <Show when={s().status === "ready"} fallback={<p class="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}>
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <PlayButton
            playing={s().enabled}
            onClick={() => a.setEnabled(!s().enabled)}
            name={s().instrument || "kit"}
            hint="playing along with the tala"
          />
          <span class="text-xs text-gray-500 dark:text-gray-400">{s().enabled ? "Plays with the tala" : "Off"}</span>
          <select aria-label="Variety" class={SMALL_SELECT} onChange={(e) => a.setVariety(e.currentTarget.value as Variety)}>
            <For each={VARIETY_OPTIONS}>{(o) => <option value={o.value} selected={o.value === s().variety}>{o.label}</option>}</For>
          </select>
          <Show when={s().hasKorvai}>
            <button
              type="button"
              aria-pressed={s().korvaiQueued}
              onClick={() => a.askForKorvai()}
              class="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 aria-pressed:border-amber-600 aria-pressed:text-amber-700 dark:border-gray-600 dark:hover:bg-gray-800"
            >
              Korvai
            </button>
          </Show>
        </div>
        <Level label={`${capitalize(s().instrument || "Kit")} level`} value={s().volume} onInput={(v) => a.setVolume(v)} />
      </div>
    </Show>
  );
}

function HandsQuick(props: { h: Extract<TrackInstrument, { kind: "hands" }> }) {
  const s = () => props.h.state();
  const a = props.h.actions;
  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500 dark:text-gray-400">Plays the tala's beats</span>
        <select aria-label="Clap sounds" class={SMALL_SELECT} onChange={(e) => void a.setSoundGroup(e.currentTarget.value)}>
          <For each={s().soundGroups}>{(g) => <option value={g} selected={g === s().soundGroup}>{g}</option>}</For>
        </select>
      </div>
      <Level label="Claps level" value={s().volume} onInput={(v) => a.setVolume(v)} />
    </div>
  );
}

function Level(props: { label: string; value: number; onInput: (v: number) => void }) {
  return (
    <label class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span class="w-10">Level</span>
      <input
        type="range"
        aria-label={props.label}
        min={0}
        max={100}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.valueAsNumber)}
        class="w-full accent-amber-600"
      />
      <span class="w-8 text-right tabular-nums">{props.value}</span>
    </label>
  );
}

function Toggle(props: { label: string; short: string; on: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.on}
      title={props.label}
      onClick={() => props.onClick()}
      class="h-7 w-7 rounded-md border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-50 aria-pressed:border-amber-600 aria-pressed:bg-amber-600 aria-pressed:text-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {props.short}
    </button>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
