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
  clock. On stop it rewinds the cursor to the first step not yet heard. It
  hands out a whole beat, ticks included, once the beat's *start* enters the
  window. That's harmless for short beats, but a Misra Chaapu at 10 bpm is one
  21 s beat, so a tempo change can't reach ticks already scheduled.
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
  tracks share one start time and the shared `Tempo`. The 25/100 ms numbers are
  the defaults from "A Tale of Two Clocks" (web.dev), not tuned. They tolerate
  about 75 ms (look-ahead minus interval) of main-thread stall before a note
  plays late. A late note is clamped to `currentTime`, and later notes stay on
  the grid. Tempo isn't limited by the window: at 300 bpm with sankeernam ticks
  about 22 ms apart, every tick still gets its exact audio time.
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

See NEXTSTEPS.md for the order.

- **Shruthi box:** a continuous voice on the `drone` bus; it is not a sequencer.
  Keep the pitch maths (tonic Hz, string ratios) in the engine; the mridangam
  and tabla dayan tune to the same tonic.
- **Mridangam / tabla:** do the musical-timeline refactor first. Each sequencer
  currently advances its own `nextTime += duration`, so two of them apply a
  tempo change at different event boundaries and drift apart. Sequencers should
  emit events in musical time (cycle, akshara, exact fraction) and one shared
  tempo map converts that to seconds. Then add a `Sequencer<StrokeEvent>` that
  emits per stroke (not per beat), reads the tala's position for eduppu and
  korvai alignment, and plays on the `percussion` bus.
- Drum playback needs choke groups (a damped stroke cuts a ringing one on the
  same head), so give each sounding note its own gain node and fade it out over
  5-10 ms rather than calling `stop()`, which clicks. Also plan for 2-3 takes per
  stroke, picked by the step's `variant`, and trimmed mono samples, since decoded
  PCM is about 350 KB/s stereo.

## PRs

Follow the `start_pr` description format. For before/after evidence:

- **Screenshots** go on the orphan `pr-assets` branch under `<pr-branch>/`, not
  in the PR branch. Link them as
  `https://github.com/panyam/layaguide/blob/pr-assets/<path>?raw=true`.
- **The old app** runs from a worktree of the `pre-sadhana-port` tag, served
  with `python3 -m http.server`, at `/templates/home.html`.
- **Audio timing** is measured by wrapping `AudioBufferSourceNode.prototype.start`
  in an init script and recording each `when`. That captures the scheduled audio
  time; image-change timing only shows animation-frame jitter.

## Checking in a browser

Playwright's Chromium is at `~/.cache/ms-playwright/chromium-1234/`, and
`playwright-core` can be required from another project's node_modules (e.g.
`../Agni/main/web`). Launch with `--autoplay-policy=no-user-gesture-required`.
`text=Start` also matches the Restart button, so select the play button with
`button.min-w-24`.
