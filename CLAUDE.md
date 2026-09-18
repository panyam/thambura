# Sadhana

A music-practice app (tala keeper today; shruthi box and mridangam next). Go
serves goapplib page shells; a Solid island does everything in the browser.
There is no server-side data.

## Commands

```sh
make run         # ui + go run on :8000 (8080 is taken in the dev container)
make test        # go test ./... ; pnpm typecheck ; pnpm test (vitest)
make ui          # pnpm install, Tailwind -> web/static/css/tailwind.css, esbuild -> web/static/app.js
make templates   # templar get: re-vendor goapplib templates after a ref bump
make deploy      # App Engine, project layagnana
```

Built assets (`app.js`, `tailwind.css`) are gitignored. `.gcloudignore` exists
so a deploy still uploads them.

## Naming

The display name **Sadhana** lives in `internal/brand.Name`. The folder
and GitHub repo (`layaguide`) and the App Engine project id
(`layagnana`) are from before the rename and stay as they are for now.

## Server (Go)

- `internal/web/pages.go`: `NewApp` loads templates through templar's
  `SourceLoader` (`web/templates/templar.yaml` maps `@goapplib/` to the vendored
  copy in `templar_modules/`, which is committed). `HomePage` embeds
  `goal.BasePage` plus a `Header` struct for goapplib's header.
- `web/templates/BasePage.html` extends goapplib's BasePage: our logo, no login
  actions, no HTMX, no header drawer. Pages must define both `BodySection` and
  `PageScripts`; Go templates reject a second definition, so the base can't give
  them defaults.

## Frontend (web/src)

**engine/** is pure TypeScript with no DOM, audio or timers, and is fully
unit-tested:

- `carnatic.ts` holds the tala tables (jaathi counts, nadai tick offsets, chaapu
  durations, anga and sapta templates). The nadai offsets are accent patterns,
  not even subdivisions.
- `selection.ts` holds the settings (`TalaSettings`, `TalaId` is
  `sapta_*`/`chaapu_*`/`custom_*`), the UI option catalogs, and `beatsFor`.
- `cursor.ts` walks the beats, repeating each one kalai times.
- `sequencer.ts` has `Sequencer<E>` (the look-ahead contract) and
  `TalaSequencer`, which turns the cursor into timed `StepEvent`s on the audio
  clock. On stop it rewinds the cursor to the first step not yet heard.
- `assets.ts` parses sound/image groups from `TalasFixtures.json`. Groups named
  in `RandomGroups` pick an entry per step from the step's `variant` draw
  (the SaRiGaMa "randomness mode").

**player/** is the browser side:

- `audio.ts` (`AudioEngine`): one AudioContext; buses `tala`, `drone`,
  `percussion` feed a master gain, then a limiter, then the speakers. It holds a
  sample cache. `cancel(bus)` stops only samples that haven't started.
  `heardNow` is the audio time minus output latency.
- `transport.ts`: every 25 ms, driven by a Web Worker timer so background tabs
  aren't throttled, it pulls events up to 100 ms ahead from each sequencer. All
  tracks share one start time and the shared `Tempo`.
- `presenter.ts` (`PlayerPresenter`): owns the engine and the transport, turns
  steps into `audio.play` calls plus image cues, and shows each cue in a
  `requestAnimationFrame` loop once `heardNow` reaches it. It doesn't import
  Solid, and its tests run it under fakes.
- `PlayerView.tsx`: renders `PlayerState` and calls the presenter's intents.
  `island.tsx` wires the real browser dependencies in, and `main.ts` mounts it
  from a tsappkit `BasePage`, which also wires the theme toggle.

`build.mjs` aliases solid-js to a single copy. Two copies silently break
reactivity across tsappkit-solid.

## Adding the shruthi box / mridangam

- **Mridangam:** add a `Sequencer<StrokeEvent>` in the engine (stroke patterns
  are beats and ticks, like the tala), `transport.add` it, and play its events
  on the `percussion` bus. It shares the tala's tempo and start time.
- **Shruthi box:** a continuous voice on the `drone` bus; it is not a sequencer.
  Keep the pitch maths (tonic Hz, string ratios) in the engine.

## Checking in a browser

Playwright's Chromium is at `~/.cache/ms-playwright/chromium-1234/`, and
`playwright-core` can be required from another project's node_modules (e.g.
`../Agni/main/web`). Launch with `--autoplay-policy=no-user-gesture-required`.
`text=Start` also matches the Restart button, so select the play button with
`button.min-w-24`.
