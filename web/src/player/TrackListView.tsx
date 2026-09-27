import { createSignal, For, Match, Show, Switch, type Accessor, type JSX } from "solid-js";
import { MAX_CYCLE, MIN_CYCLE, RAAGINI_CYCLE, THAMBURA_MODES, type Swara } from "../engine/shruthi";
import type { HandsPresenter, HandsState } from "./handsPresenter";
import type { KitPresenter, KitState } from "./kitPresenter";
import { StrokeLane } from "./StrokeLane";
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
 * The instruments on the page as a list of full-width rows (#101), so any
 * number can be open at once without a grid to rearrange. Each row shows
 * the instrument's name, main controls, level, mute and solo on one line;
 * the toggle at its end opens its whole panel and Remove. While any row is
 * soloed, the rest fade, since they're silent. Add offers what can go on the
 * page now, and a removed instrument can be brought back from the note that
 * follows.
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

      <div class="flex flex-col gap-3">
        {/* Keyed by id, not by row: the list makes new row objects on every
            change (a mute, a solo), and a row remade would close its panel. */}
        <For each={s().rows.map((r) => r.id)}>
          {(id) => (
            <Show when={s().rows.find((r) => r.id === id)}>
              {(row) => <TrackRowView row={row()} soloing={s().rows.some((r) => r.soloed)} {...props} />}
            </Show>
          )}
        </For>
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

/**
 * One instrument as a full-width row: its name, main controls, level, mute
 * and solo on one line (wrapping on a phone), anything it shows while
 * playing under that (the kit's stroke lane), and, opened with the toggle at
 * the end of the line, its whole panel and Remove. Remove lives only in the
 * open row, so it's never next to the control used most.
 */
function TrackRowView(props: TrackListViewProps & { row: TrackRow; soloing: boolean }) {
  const [open, setOpen] = createSignal(false);
  const row = () => props.row;
  const inst = () => props.instrument(row().id);
  const name = () => nameOf(row(), props);
  // The claps have no panel and can't be removed, so there's nothing to open.
  const opens = () => row().kind !== "hands";
  return (
    <article
      aria-label={name()}
      class={`rounded-xl border bg-white shadow-sm transition-opacity dark:bg-gray-900 ${
        row().soloed ? "border-amber-500" : "border-gray-200 dark:border-gray-700"
      } ${props.soloing && !row().soloed ? "opacity-50" : ""}`}
    >
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
        {/* On a phone: name, mute, solo and the toggle on top, the controls on
            a line of their own under them. From lg up, all one line. */}
        <div class="flex min-w-0 flex-1 items-center gap-2 lg:w-32 lg:flex-none">
          <span
            aria-hidden="true"
            class={`h-2.5 w-2.5 shrink-0 rounded-full ${sounding(inst()) && !row().muted ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
          />
          <h3 class="truncate font-semibold">{name()}</h3>
        </div>
        <div class="order-last flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:order-none lg:w-auto lg:flex-1">
          <Show when={inst()}>
            {(i) => (
              <Switch>
                <Match when={i().kind === "thambura" && (i() as Extract<TrackInstrument, { kind: "thambura" }>)}>
                  {(t) => <ThamburaQuick t={t()} />}
                </Match>
                <Match when={i().kind === "kit" && (i() as Extract<TrackInstrument, { kind: "kit" }>)}>
                  {(k) => <KitQuick k={k()} />}
                </Match>
                <Match when={i().kind === "hands" && (i() as Extract<TrackInstrument, { kind: "hands" }>)}>
                  {(h) => <HandsQuick h={h()} />}
                </Match>
              </Switch>
            )}
          </Show>
        </div>
        <div class="flex items-center gap-1.5">
          <Toggle label={row().muted ? `Unmute ${name()}` : `Mute ${name()}: keep it playing, silently`} on={row().muted} onClick={() => props.actions.setMuted(row().id, !row().muted)}>
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </Toggle>
          <Toggle label={row().soloed ? `Stop soloing ${name()}` : `Solo ${name()}: hear only the soloed instruments`} on={row().soloed} onClick={() => props.actions.setSoloed(row().id, !row().soloed)}>
            <path d="M4 14v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" stroke-width="2" />
            <rect x="3" y="13" width="4" height="7" rx="1.5" />
            <rect x="17" y="13" width="4" height="7" rx="1.5" />
          </Toggle>
          <Show when={opens()}>
            <button
              type="button"
              aria-expanded={open()}
              aria-label={open() ? `Show less of ${name()}` : `Show more of ${name()}`}
              title={open() ? "Show less" : row().kind === "thambura" ? "Views, Lab and presets" : "The pad, and Remove"}
              onClick={() => setOpen(!open())}
              class="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <svg viewBox="0 0 20 20" class={`h-5 w-5 transition-transform ${open() ? "rotate-180" : ""}`} fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06z" clip-rule="evenodd" />
              </svg>
            </button>
          </Show>
        </div>
      </div>

      {/* What the kit plays this cycle, while it plays along. */}
      <Show when={inst()?.kind === "kit" && (inst() as Extract<TrackInstrument, { kind: "kit" }>)}>
        {(k) => (
          <Show when={k().state().enabled && k().state().status === "ready"}>
            <div class="px-3 pb-3">
              <StrokeLane
                full
                lane={() => k().state().lane}
                strokeIndex={() => k().state().strokeIndex}
                kit={k().state}
                variety={() => k().state().variety}
                setVariety={(variety) => k().actions.setVariety(variety)}
                hasVariations={() => k().state().hasVariations}
                hasKorvai={() => k().state().hasKorvai}
                korvaiQueued={() => k().state().korvaiQueued}
                askForKorvai={() => k().actions.askForKorvai()}
              />
            </div>
          </Show>
        )}
      </Show>

      <Show when={open() && inst()}>
        {(i) => (
          <div class="flex flex-col gap-3 border-t border-gray-200 p-3 dark:border-gray-700">
            <Switch>
              <Match when={i().kind === "thambura" && (i() as Extract<TrackInstrument, { kind: "thambura" }>)}>
                {(t) => (
                  <ThamburaDocked
                    compact
                    state={t().state}
                    actions={t().actions}
                    shareUrl={props.shareUrl && ((link) => props.shareUrl!(row().id, link))}
                    analyser={props.analyser && (() => props.analyser!(row().id))}
                  />
                )}
              </Match>
              <Match when={i().kind === "kit" && (i() as Extract<TrackInstrument, { kind: "kit" }>)}>
                {(k) => <StrokePad state={k().state} actions={k().actions} />}
              </Match>
            </Switch>
            <Show when={row().removable}>
              <button
                type="button"
                aria-label={`Remove ${name()}`}
                onClick={() => props.actions.remove(row().id)}
                class="self-end rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:border-red-400 hover:bg-red-50 hover:text-red-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-red-950/40 dark:hover:text-red-300"
              >
                Remove {name().toLowerCase()}
              </button>
            </Show>
          </div>
        )}
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
    <>
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
      {/* The round's length, as Studio's Duration: right is a longer round. */}
      <Slider
        label="Round"
        aria="Thambura round length"
        min={MIN_CYCLE}
        max={MAX_CYCLE}
        step={0.1}
        value={s().settings.cycleSeconds}
        readout={`${s().settings.cycleSeconds.toFixed(1)} s`}
        onInput={(cycleSeconds) => a.set({ cycleSeconds })}
      />
      <Level label="Thambura level" value={s().settings.volume} onInput={(volume) => a.set({ volume })} />
    </>
  );
}

function KitQuick(props: { k: Extract<TrackInstrument, { kind: "kit" }> }) {
  const s = () => props.k.state();
  const a = props.k.actions;
  return (
    <Show when={s().status === "ready"} fallback={<p class="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}>
      <PlayButton playing={s().enabled} onClick={() => a.setEnabled(!s().enabled)} name={s().instrument || "kit"} hint="playing along with the tala" />
      <span class="text-xs text-gray-500 dark:text-gray-400">{s().enabled ? "Plays with the tala" : "Off"}</span>
      <Level label={`${capitalize(s().instrument || "Kit")} level`} value={s().volume} onInput={(v) => a.setVolume(v)} />
    </Show>
  );
}

function HandsQuick(props: { h: Extract<TrackInstrument, { kind: "hands" }> }) {
  const s = () => props.h.state();
  const a = props.h.actions;
  return (
    <>
      <span class="text-xs text-gray-500 dark:text-gray-400">Plays the tala's beats</span>
      <select aria-label="Clap sounds" class={SMALL_SELECT} onChange={(e) => void a.setSoundGroup(e.currentTarget.value)}>
        <For each={s().soundGroups}>{(g) => <option value={g} selected={g === s().soundGroup}>{g}</option>}</For>
      </select>
      <Level label="Claps level" value={s().volume} onInput={(v) => a.setVolume(v)} />
    </>
  );
}

function Slider(props: { label: string; aria: string; min: number; max: number; step?: number; value: number; readout: string; onInput: (v: number) => void }) {
  return (
    <label class="flex min-w-[12rem] flex-1 items-center gap-2 text-xs text-gray-500 lg:max-w-xs dark:text-gray-400">
      <span>{props.label}</span>
      <input
        type="range"
        aria-label={props.aria}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.valueAsNumber)}
        class="w-full accent-amber-600"
      />
      <span class="w-12 whitespace-nowrap text-right tabular-nums">{props.readout}</span>
    </label>
  );
}

function Level(props: { label: string; value: number; onInput: (v: number) => void }) {
  return <Slider label="Level" aria={props.label} min={0} max={100} value={props.value} readout={String(props.value)} onInput={props.onInput} />;
}

/** A mixer button: an icon, its meaning in the label and tooltip, lit when on. */
function Toggle(props: { label: string; on: boolean; onClick: () => void; children: JSX.Element }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.on}
      title={props.label}
      onClick={() => props.onClick()}
      class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 aria-pressed:border-amber-600 aria-pressed:bg-amber-600 aria-pressed:text-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
        {props.children}
      </svg>
    </button>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
