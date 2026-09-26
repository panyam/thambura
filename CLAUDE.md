# Thambura

A music-practice app (tala keeper and thambura drone today; mridangam next). Go
serves goapplib page shells; a Solid island does everything in the browser.
There is no server-side data.

## Commands

```sh
make run         # ui + go run on :8000 (8080 is taken in the dev container)
make test        # go test ./... ; pnpm typecheck ; pnpm test (vitest)
make ui          # pnpm install, Tailwind -> web/static/css/tailwind.css, esbuild -> web/static/app.js
make templates   # templar get: re-vendor goapplib templates after a ref bump
make devkit      # copy an instrument kit in from ../mridangam-data (gitignored)
make setupvenv   # one Python venv at ../.venv, shared by every worktree
make deploy      # tests + prod build, then App Engine project thambura (see Deploying)
make deploydev   # the same, to a no-traffic "dev" version, to try before thambura.com
make prodlogs    # tail App Engine logs
```

Built assets (`app.js`, `tailwind.css`) are gitignored. `.gcloudignore` exists
so a deploy still uploads them.

`web/` has three pnpm scripts no make target and no CI runs, so they only run
when you type them: `pnpm bench` (times the pluck renderer, see `tambura.ts`
below), `pnpm render-mix` (renders the thambura to WAV, see
`docs/designs/sound-analysis.md`) and `pnpm watch`. There are no GitHub Actions in
this repo at all; `make test` is the whole gate, and `make deploy` runs it.

## Naming

The product is **Thambura** everywhere: the display name
(`internal/brand.Name`), the GitHub repo (`panyam/thambura`), the Go module
(`github.com/panyam/thambura`), the App Engine project and thambura.com. The
drone feature inside the app is also called the thambura. The local
checkouts live under `thambura/` (it used to be `layaguide`), and the
`pre-sadhana-port` tag keeps the port's working name (it was briefly called
Sadhana).

## Server (Go)

- `internal/web/pages.go`: `NewApp` loads templates through templar's
  `SourceLoader` (`web/templates/templar.yaml` maps `@goapplib/` to the vendored
  copy in `templar_modules/`, which is committed). `HomePage` embeds
  `goal.BasePage` plus a `Header` struct for goapplib's header, and a
  `page.Spec`.
- **Page spec** (#89): `internal/page` describes what a page starts with, its
  islands (views: a name, a `data-slot`, a presentation and config) and the
  instruments it seeds (a kind and config). `homeSpec` in `pages.go` builds
  the home page's, with a `kit` instrument per kit found. The partial
  `web/templates/page/Islands.html` writes it as
  `<script type="application/json" id="page-spec">`, and all island config
  travels there, never in `data-*` attributes. `internal/page` and
  `web/src/page/` import nothing else from this repo (`make liftcheck`, part of
  `make test`), since they're meant to move into goapplib and tsappkit after
  #92.
- Templates come in three layers. `web/templates/BasePage.html` extends
  goapplib's BasePage: our logo, no login actions, no HTMX, no header drawer.
  A layout (`web/templates/layouts/Drawer.html`) includes it, defines
  `BodySection` with the slots and `PageScripts` with the spec, and asks the
  page for `PageContent`. `HomePage.html` is only that content (the About
  text) plus the include. Go templates reject a second definition, so none of
  these can give another's blocks defaults.
- Search and link previews: pages render a `SitePage` (goapplib's
  `BasePage` plus our `Header`, `Social` and `StructuredData`), and
  `BasePage.html` turns it into the canonical link, Open Graph and Twitter
  tags, icons, manifest and JSON-LD. Absolute URLs come from `brand.URL`
  (`https://thambura.com`), so the www and appspot copies point at it. Go
  serves `/robots.txt`, `/sitemap.xml`, `/favicon.ico` and `/sw.js` (the
  service worker has to come from the root to cover the site, and goes out
  with `Cache-Control: no-cache`). `HomePage.html`
  has a visible About section under the player, the page's only `<h1>` and
  the only text a crawler that doesn't run JavaScript sees. The PNGs
  (`web/static/og.png`, `web/static/icons/`, `favicon.ico`) come from
  `node design/render-images.mjs` (preview layout in `design/og.html`),
  which needs `PLAYWRIGHT_CORE` and `CHROMIUM` pointed at an install.
- **Labs** (#90, `internal/web/labs.go`): layout experiments on the live site
  under `/labs/<slug>`, listed at `/labs/`. The `labs` slice drives both the
  routes and the index. Each labs page is its own goapplib page type with a
  template under `web/templates/labs/`, and they all sit on one mux wrapped
  in `noindex`, with a canonical link to `/` and no sitemap entry. Every
  labs layout shows the `LabsBanner` strip (`layouts/LabsBanner.html`). A
  labs page shares the instruments and their settings with `/`; only
  layout state would be its own, and none has any yet. `/labs/side-by-side`
  (`layouts/SideBySide.html`) puts the tala and a docked thambura in two
  columns from `lg` up and stacks them below that.
- `/legacy/` serves the 2016 app from `web/legacy/`, copied from the
  `pre-sadhana-port` tag with its `/static/` paths moved under
  `/legacy/static/` (see `web/legacy/README.md`). Nothing links to it from
  the app; it links back. `app.yaml` needs a separate `static_files` line for
  `/legacy/`, since `static_dir` serves no index page. Both it and the Go
  server send `X-Robots-Tag: noindex` for `/legacy`.

## Frontend (web/src)

Two things that have bitten:

- **Pass presenter methods wrapped, not bare.** `onChange={a.setVariety}` in
  JSX loses `this`, so the method throws on `this.state`. Write
  `onChange={(v) => a.setVariety(v)}`. The control looks like it works while
  the console fills with "Cannot read properties of undefined".
- **The web tsconfig has no `@types/node`**, so a vitest test can't use
  `node:child_process` or `process`. Checks that need them belong in the
  Makefile instead: `pnpm patterns:check` runs there, not in vitest.

The design docs are in `docs/designs/`; `docs/` itself is the developer
docs site (see Docs site below). `docs/designs/architecture.md` explains how the sounds are made and timed, timed vs
continuous voices, and what changed from the 2016 app. `docs/designs/layouts.md` and
`docs/designs/library.md` are plans, not descriptions: where the thambura could sit,
and what it would take to import these pieces from another project.
`docs/designs/sound-analysis.md` explains how the jawari voice was fitted to a
recording, and how to rerun it: `pnpm render-mix` (web/scripts, over
`src/tools/thamburaMix.ts`) renders the thambura offline to WAV, and the
Python in `tools/sound-analysis/` measures and charts it against a recording
kept in the gitignored `recordings/`. `features.py` writes every measurement
to a feature file (one shape for a recording or a render), `score.py` scores
two of them against each other, and `tables.py` writes the doc's tables from
the committed files in `tools/sound-analysis/features/`, so they survive
without the audio. `make soundtest` runs the Python tests and checks the doc's
tables; it stays out of `make test` so a deploy needs no Python. The notes below are the file-by-file
reference.

**engine/** is pure TypeScript with no DOM, audio or timers, and is fully
unit-tested:

- `carnatic.ts` holds the tala tables (jaathi counts, nadai tick offsets, chaapu
  durations, anga and sapta templates). The nadai offsets are accent patterns,
  not even subdivisions.
- `selection.ts` holds the settings (`TalaSettings`, `TalaId` is
  `sapta_*`/`chaapu_*`/`custom_*`), the UI option catalogs, and `beatsFor`.
- `cursor.ts` walks the beats, repeating each one kalai times.
- `ratio.ts` is exact fractions. Beat durations, tick offsets and musical
  positions are all `Ratio`s, so voices reaching the same point by different
  sums agree exactly.
- `tempoMap.ts` (`TempoMap`) turns musical time (counts since Start) into
  audio seconds for every voice on one transport. The transport starts it and
  reports its horizon after each tick; a tempo change is anchored at the
  horizon, so nothing already booked moves and every voice switches at the
  same instant.
- `sequencer.ts` has `Sequencer<E>` (the look-ahead contract) and
  `TalaSequencer`, which emits a `StepEvent` per beat (for the image) and a
  `TickEvent` per sound, each at an exact musical position, converted to
  seconds through the map only when pulled. So a tempo change reaches the
  rest of a long beat (a Misra Chaapu at 10 bpm is one 21 s beat). On stop it
  rewinds the cursor to the first step not yet heard.
- `assets.ts` parses sound/image groups from `TalasFixtures.json`, each a map
  from a beat's name to a file. (The 2016 app's SaRiGaMa groups, a random
  tick and a random swara image per beat, were dropped with their per-step
  random draw.) The player opens on the first sound and
  image group in the fixture, so group order there sets the defaults (Right
  hand for images). The Right hand and Left hand image sets
  are SVGs generated by `node design/hands.mjs`; edit the script and rerun it
  rather than editing the files. "one" lights the little finger and "five"
  the thumb, as in Simple.
- `shruthi.ts` is the thambura's pitch maths and settings: 15 keys from A2 to
  B3 with kattai names (C3 = 1 is a men's Sa, G3 = 5 a women's; gents/ladies
  is timbre, not octave), the 12 swarasthanas with just ratios, and
  `normalizeThambura`, which clamps anything (saved JSON, a patch) to valid
  settings.
- `motion.ts` is how the beat image moves between beats, chosen from the
  Animation menu under the image, in a row with Images and Sounds
  (`MOTION_OPTIONS`: lift and drop, the default, then eased dip, size swing,
  two fades, pop, off). `motionAt` returns a `BeatPose` (scale, opacity, lift)
  that is at rest when a beat sounds. The swing-style ones follow a parabola,
  hold still through a beat's first part when it is longer than 0.8 s, and
  fade out between 0.5 s and 0.25 s beats (120 to 240 bpm for a one-count
  beat).
- `tambura.ts` renders a pluck as a sum of decaying harmonics. `pluckVoice(s,
  string)` has three characters. The jawari voice (mode `jawari`, shown as
  "Tambura", the default and the Raagini's TMB) was fitted to a recording of a real C tambura: it starts dark,
  and a band around 1.3 kHz swells by up to about 40 dB, peaks near 1.4 s and
  falls back (the `formant*` fields; the low Sa blooms about half as much).
  The bloom mostly moves energy rather than adding it (`formantEnergy`), and
  the render is scaled by its attack, not its peak (`attackLevel`), so the
  mix stays level and every pluck is heard. The
  classic voice (mode `tambura`, "Tambura (classic)") sweeps a resonance down
  through the harmonics, rings 12-36 s (to -60 dB) and keeps its high
  harmonics. In guitar mode it rings 2.5-8 s and dulls quickly. The classic
  and guitar renders are pinned by fingerprints in `thambura.test.ts`, the
  jawari one by four more. A 9 s string takes about 40 ms to render at 48 kHz
  (`pnpm bench`, over `web/scripts/bench-render.mjs`, times all four strings of
  each plucked voice), so `PluckRender` renders a few harmonics per
  `step(budget)` and gives the same samples however the work is sliced. It
  renders four harmonics in one pass over the buffer, since each sample of one
  harmonic waits on the one before it, and works out the parts of the envelope
  that don't depend on the harmonic once per render rather than once per
  harmonic; both keep the samples bit-identical, which is what the fingerprints
  are for. Treat that as the rule for this file: the jawari voice was fitted to
  a recording, so a speed-up that moves the samples is a sound change wearing a
  performance change's clothes, and the fingerprints are there to catch it. A
  harmonic's angle is worked out in `harmonic()` and nowhere else, because
  `(2 * PI * k * freq) / rate` and `((2 * PI * freq) / rate) * k` differ in
  their last bits; four harmonics are added to the buffer one at a time,
  never as one expression, for the same reason. After #38 the rotation is
  about 0.76 ns per harmonic-sample of the 1.4 that remain and the envelope's
  `exp` and `pow` are most of the rest, so WebAssembly (#41) has less to win
  than #36 estimated, and the next plain-JavaScript lever -- evaluating the
  envelope every 128 or 256 samples rather than every 64 -- would change the
  sound. Never render inside a
  transport tick. `reedSpectrum` gives the sruti drone's PeriodicWave.
- `thamburaPlan.ts`: a `ThamburaPlan` is everything that decides how the
  plucked thambura plays: per string a `PluckVoice`, level, pan, detune and
  damp lead, plus the four gaps. `planFor` builds one for any mode (the
  string levels, pans and the 1.5-cent Sa detune live here); Custom mode
  plays the plan the Lab view edits. `FIELD_SPECS` lists the Lab's controls
  and their ranges, which cover every built-in mode's values, and
  `normalizePlan` clamps a saved or pasted plan to them.
- `presets.ts`: the sounds that ship with the app (`BUILT_IN_PRESETS`),
  each a share link like a listener's own preset, so adding one means
  building it in the Lab and pasting its link in. Shimmer and Warm lean
  Hindustani (#51). They can't be renamed, deleted or written over, so Save
  is refused on them and Save as… keeps your version.
- `shareLink.ts`: the thambura's whole setup (settings but volume, view,
  whether the bar is open, and for Custom mode the plan) packed into the
  `?s=` query parameter as base64url bytes. The presenter never sets the
  bar's flag; `barOpen` and `withBarOpen` read and flip that one bit and
  leave every other byte alone, so the drawer can add it on the way out. A Custom plan is stored as edits
  to the closest built-in plan (or field by field, whichever is shorter),
  with a checksum of that plan so a link made before a built-in sound
  changed can say so. Slider values take a byte or two; anything off a
  slider's step, and voice values the Lab hides, travel as exact floats.
  Links run 18-32 characters for everyday setups and stay under 200 for a
  plan edited everywhere. The orders at the top of the file are the format:
  append, never reorder, and bump `FORMAT` for anything else.
- `thamburaSequencer.ts` plucks first, Sa, Sa, low Sa in a `PluckPattern`:
  `EVEN_PATTERN` (four slots and a rest) or, for the jawari mode,
  `PLAYED_PATTERN` (the recorded player's uneven gaps, plus a `DampEvent`
  that stops each string shortly before its next pluck). It works out each
  event's time only when asked, so a speed change is heard at the next pluck.

**player/** is the browser side:

- `audio.ts` (`AudioEngine`): one AudioContext, created in `main.ts` and
  shared by every island. Every note plays on a track (`TrackId`, a string;
  `Bus` is the old name for it), made the first time its id is used: a level,
  an on/off gain that mute and solo set, then a pan, into a master gain, a
  limiter and the speakers. `setLevel`/`setBusVolume`, `setPan`, `setMute`,
  `setSolo` and `removeTrack` work per track; the tala plays on `tala`, the
  thambura on `drone`, and each kit on its page id (`kit-1`). The track's pan node
  is never set unless asked, so a probe wrapping the pan setter still sees
  only the strings. It holds a
  sample cache, which `addSamples` fills with rendered PCM as well as fetched
  files. `play` takes detune/gain/pan and a choke group (a later note in the
  group fades the earlier one over 80 ms, as a re-plucked string does; groups
  are per track); `startTone` runs a continuous PeriodicWave tone.
  `cancel(track)` stops only samples that haven't started, and takes back the
  choke fades they scheduled. `release(track, s)` fades out what's sounding,
  and `damp(track, group, when, s)` fades the latest note in a choke group, as
  a finger stops a string. `audio.test.ts` runs it against
  `fakeAudioContext.ts`, which records the graph and every automation call.
  `heardNow` is the audio time minus output latency.
- `transport.ts`: every 25 ms, driven by a Web Worker timer so background tabs
  aren't throttled, it pulls events up to 100 ms ahead from each sequencer. All
  tracks share one start time and, when given one, a `TempoMap`. The 25/100 ms numbers are
  the defaults from "A Tale of Two Clocks" (web.dev), not tuned. They tolerate
  about 75 ms (look-ahead minus interval) of main-thread stall before a note
  plays late. A late note is clamped to `currentTime`, and later notes stay on
  the grid. Tempo isn't limited by the window: at 300 bpm with sankeernam ticks
  about 22 ms apart, every tick still gets its exact audio time.
- `presenter.ts` (`PlayerPresenter`): owns the engine, plays on the page's
  clock (a required `clock` dep, so the tala and a kit can't end up on two),
  and publishes its cycle there (`clock.tala`: the `TalaGrid`, the nadai, and
  `resumesAt`, the count into the cycle it starts from, set on every rebuild
  and every Start). It knows nothing about instruments, and
  turns
  steps into `audio.play` calls plus image cues, and shows each cue in a
  `requestAnimationFrame` loop once `heardNow` reaches it. The same loop
  sends the image's pose through `PlayerView.setPose`, a signal apart from
  `PlayerState`, so a frame only restyles the image. The beat ends at the
  next booked step, or at the `TempoMap`'s time for it before it's booked.
  The student's choices (motion, tala settings, tempo, volume, sound and
  image groups) are saved in localStorage under `thambura.player` on each
  change, never while loading, and restored through `normalizeSettings` and
  the catalog, so a stale value falls back to its default. It doesn't import
  Solid, and its tests run it under fakes.
- `PlayerView.tsx`: renders `PlayerState` and calls the presenter's intents.
  `island.tsx` wires the real browser dependencies in. `main.ts` is the
  page's island registry (`tala`, `thambura`) and its `makeContext`; the
  generic `web/src/page/islandPage.ts` (a tsappkit `BasePage`, which also
  wires the theme toggle) reads the page spec and mounts each island in its
  slot through `mountIslands`, which logs and skips an unknown island, a
  missing slot or a factory that throws.
- `pageContext.ts`: what every island shares, services rather than
  instruments: `audio`, `clock` (one `Transport` on one `TempoMap`,
  `createClock`), `tracks` (the instruments playing, by id; today the kit,
  under a placeholder id), `tonic` (the Sa; the thambura sets it, the kit
  follows) and `awake`. `makeContext` fills `tracks` from the spec's
  instruments, loading only the first kit for now.
- `storage.ts`: every localStorage key the instruments use goes through
  `storageKey` / `localStore`, so the instrument work's rename to instance
  ids is one place.
- `thamburaPresenter.ts` (`ThamburaPresenter`): the thambura's state, its own
  `Transport` (so it starts and stops apart from the tala), the plucked
  (tambura, guitar) and reed (sruti) voices on the `drone` bus, and the
  view and the Custom plan, saved to localStorage. Whether the bar is open
  isn't its business (#88): `thamburaDrawer.ts` (`ThamburaDrawer`) holds
  that under its own key, `thambura.drawer`, taking a link's flag over the
  saved one and, once, the `open` the presenter used to save.
  Everything plucked goes through the settings' plan (`planFor`): its voices
  key and render the samples, and `pluckOptions` turns a pluck into
  level, pan and detune. `setCustom` / `loadCustom` edit the Custom plan and
  switch to it. `state.plan` is the plan being played whatever the mode, so
  the Lab always edits what is heard and an edit from a built-in carries its
  sound into Custom. A sound change while playing restarts the round from the
  first string that isn't muted (`audition`, `ThamburaSequencer.startWith`),
  so it is heard at once instead of a round later; ringing strings carry on
  until their own next pluck chokes them. `presetId` and `edited` follow which
  preset is playing and whether it has changed, so `savePreset` (as a new one)
  and `updatePreset` (over that one) are separate. A link
  in `deps.link` wins over the saved setup (keeping the listener's volume)
  but isn't saved over it until the listener changes something; every change
  writes the current link back. Presets (`ThamburaPreset`) are a name and a
  share link, kept apart from the settings in `deps.presets`; applying one
  sets the sound but not the view or volume. Opening a link that changes a
  saved setup first keeps it as the "Before shared link" preset (only the
  latest). Pitch and timbre
  changes re-render the plucks in about 20 ms slices through `deps.defer`
  (60 ms settle after a change, none between slices), and Start waits for them,
  about 0.35 s from cold. Fine tune is only `detune`. In both tambura modes the
  second Sa string plays 1.5 cents sharp, so the pair beats slowly. Damp
  events fade a string over 0.2 s through `audio.damp`, which marks the note
  released so the re-pluck's choke leaves it alone. Sruti mode
  mixes its three tones swara-first (0.40 / 0.25 / 0.08, panned apart), since
  the octave Sa's otherwise fuse into one note and bury the swara.
- `ThamburaPanel.tsx` is the thambura's controls wherever a layout puts
  them: `ThamburaBar.tsx` slides it up from the bottom in a drawer, and
  `ThamburaDocked` puts it in a page slot with no hide button (the
  `thambura` island's `panel` presentation, as on `/labs/side-by-side`). A
  docked thambura has no drawer and no floating controls, T still plays it,
  and its links always set the bar's bit (`linkShowsBar`), since it's
  always in view.
- `ThamburaBar.tsx` is the bar that slides up from the bottom when the
  floating `#thambura-toggle` is clicked. The panel's header holds the one start/stop button
  every view shares (the views have none of their own, except the Raagini's
  power switch, part of the replica), the Sound menu (the mode,
  from `THAMBURA_MODES`, the presets that ship (`BUILT_IN_PRESETS`) and the
  saved ones in one list, playing as soon as one is picked, with "Custom
  (unsaved)" while an edit isn't saved) and a switch between
  four views over the same presenter: `ThamburaMini`, `ThamburaStudio`,
  `ThamburaRaagini` (the 2000s Raagini box, with `Knob.tsx`, which keeps its
  own TMB/GTR/SHRUTHI slide switch as part of the replica) and `ThamburaLab`,
  a workbench for the Custom plan, string by string, whose Duration slider
  is the round's length (right is longer, in the Lab and in Studio; the
  Raagini keeps its Tempo knob, clockwise for faster, as the hardware has),
  that copies it out and
  in as JSON (`pnpm render-mix --custom` renders it), and holds the Save and
  Save as… buttons. "All strings" writes an edit to all four at once. Its sliders commit on
  release, since most changes re-render, and their descriptions sit in
  tooltips unless "Show descriptions" is on. Its groups flow into 1-4 CSS
  columns (`break-inside-avoid`), and the bar widens to `max-w-6xl` in the
  Lab only. Each string tab has an on/off dot and there's Solo (the
  presenter's `muted`, cleared on leaving the Lab and kept out of links), and
  "Copy…" gives the selected string another's sound (`copyString`) or copies
  it to all. `ThamburaScope` draws what the drone bus plays from
  `AudioEngine.analyser("drone")`: the level over 8 s in dB, 40 ms of wave,
  and the spectrum with the bloom band shaded. Shared bits are in
  `thamburaControls.tsx`. Every view must show every state even if it can only
  set part of it (the Raagini's Select only steps Pa/Ma/Ni/Sa).
- `thamburaIsland.tsx` wires the page's floating controls, the stack at the
  bottom right in `HomePage.html` (`#thambura-controls`): `#thambura-play`
  (start/stop from anywhere on the page, bar open or not; `reflectPlaying`
  flips its icon via `data-playing` and its label, `reflectOpen` fades the
  pair while the bar is open), `#thambura-toggle` (opens the bar: a
  tilted tambura icon, the whole button on a phone, in a pill with the
  "Shruthi box" label from `sm` up), and
  the T key (`shortcuts.ts`: not while typing in a field, not with
  Ctrl/Cmd/Alt, not on key repeat). It wires the link to the address bar: `replaceState`, no
  history entries, 400 ms after the last change, since Safari throws after
  100 calls in 30 s and a slider drag changes the setup on every step. The
  bar's header has a Copy link button, and its Sound menu plays a preset as
  soon as it is picked; the Lab saves them (Save writes over the one playing,
  Save as… keeps both) and lists them to rename, delete, copy, or Share, which
  opens the `.github/ISSUE_TEMPLATE/share-a-preset.yml` form filled in, so
  listeners can offer sounds to become built-in presets.
- `sw.ts` is the service worker (its own esbuild bundle, classic script, no
  source map, `__BUILD__` set to the git revision so each deploy gets a fresh
  cache). Pages are network-first, everything else cache-first with a
  background refresh. It makes the app installable (browsers want a manifest
  plus a worker handling `fetch`) and it runs the whole app offline. It needs
  WebWorker types, not DOM, so `tsconfig.json` excludes it and
  `tsconfig.sw.json` checks it; `pnpm typecheck` runs both.
- `install.ts` keeps the `beforeinstallprompt` event and shows the header's
  `#install-app` button, since browsers only hint at installing. iOS never
  fires it, so `#install-hint` in the About text points at Share -> Add to
  Home Screen instead. Both stay hidden in an installed app.
  `web/static/manifest.json` carries the icons and the two screenshots the
  install dialog shows (regenerate them the way `design/render-images.mjs`
  renders the icons: a browser at 390x844 and 1280x720).
- `keepAwake.ts`: `KeepAwake` holds a Screen Wake Lock while either island
  reports playing (through `onPlaying`), and takes it again when the page is
  shown, since browsers drop it on hidden pages. `usePlaybackSession` sets
  Safari's `navigator.audioSession.type` to "playback" so the silent switch
  doesn't mute us. Nothing a web page does keeps Web Audio alive on iOS after
  a power-button lock.

`build.mjs` aliases solid-js to a single copy. Two copies silently break
reactivity across tsappkit-solid.

## Adding the shruthi box / mridangam

See NEXTSTEPS.md for the order.

- **Shruthi box:** done as the thambura (see above). Its plucked modes are a
  sequencer on its own clock and speed, not the tala's tempo; its sruti mode
  is the continuous voice. The mridangam and tabla dayan should tune to its
  tonic (`tunedTonicHz`). Sound quality is issue #8: the jawari voice, fitted
  to a real recording, is the default, and the Lab, links and presets are
  how it gets tuned by ear from here, by us and by listeners.
- **Struck instruments are kits, and the code knows nothing about any one of
  them.** `engine/kit.ts` reads a `kit.json`: zones (the groups of strokes
  that choke each other, a mridangam's two heads or a ghatam's one surface),
  packs (tunings, or one unpitched pack played as recorded), and strokes with
  takes per pack. `player/kitPresenter.ts` is a kit as a track: it loads
  one, follows the thambura's Sa, plays on its own audio track (`kit-1`,
  numbered by kind in the spec's order) and, given the page's clock, plays
  along with the tala (below); `player/StrokePad.tsx` draws whatever the
  manifest declares. The mridangam is data, not code. `docs/designs/mridangam.md` is the plan
  (strokes and tuning, patterns per tala, packaging, views, build order).
- **Kits aren't committed.** They're build products from the `thambura-data`
  repo: `make devkit` copies one into `web/static/Resources/Kits/<kit>/`,
  which is gitignored. Go looks for every `*/kit.json` under there at startup
  (`App.KitURLs`) and seeds a `kit` instrument in the page spec for each, so
  a checkout without a kit asks for nothing and shows no pad. Only the first
  kit loads for now.
- **A kit keeps a folder per pack**, `compmusic/c/cha-c-1.flac`, because App
  Engine caps a directory at 1,000 files and says so is final. A flat kit was
  232 files and a second drum would have walked into it. `KITSRC` picks which
  copy `make devkit` takes: `kit-flac` (the default, what the app loads) or
  `kit` (the master WAVs).
- **FLAC, not a smaller format.** A lossy format carries encoder padding, and
  trimming it is the decoder's business, so a stroke's attack can land late.
  Playwright's Chromium also has no proprietary codecs, so an AAC kit decodes
  nowhere in our browser checks. Sizes per pack: wav 1636 KB, flac 1028, mp3
  336, opus 332.
- **The instrument plays with the tala.** `engine/talaGrid.ts` turns the
  beats and kalai into a cycle length and says which cycle, beat and repeat a
  count falls in. `engine/strokeSequencer.ts` is a `Sequencer<StrokeEvent>` on
  the tala's own `TempoMap`, queued a cycle at a time, so strokes and claps
  are the same musical points and can't drift. The kit adds it to the page's
  transport itself (#97), wrapped so the transport's stop also cancels the
  kit's track; the tala only publishes its cycle on `clock.tala` and never
  sees the kit. After a stop the tala resumes from the first beat not heard,
  and `resumesAt` makes the kit's first cycle start that far back, so sam
  stays on sam. Every kit on the clock resumes the same way. `engine/patterns.ts` holds the
  types and `patternFor`, which matches a pattern to a tala on the cycle's
  shape and the nadai, so one Adi pattern serves Adi and a chatusra Thriputa
  and stretches with kalai. What's left for the mridangam is more patterns
  and a generated fallback, then arrangements (`docs/designs/mridangam.md`).
- **Patterns carry their provenance.** Three come from karya's
  `MridangamSarva.hs` (Evan Laforge's transcriptions from his teachers, GPL,
  used with permission, see `web/patterns/CREDITS.md` for the piece, the
  teacher and the stroke mapping); the Adi one was drafted here and is
  unverified. A pattern matches a tala on shape plus cycle length, since both
  chaapus are one clap and share a shape, and its positions are fractions of
  the cycle so a chaapu's single long beat works. CompMusic's transcriptions
  are CC BY-NC-ND, so they can't be adapted.
- **Patterns are notations DSL, compiled at build time.** They live in
  `web/patterns/*.not` (panyam/notations format: `\cycle`, `\beatDuration`
  and a `mrid:` role of stroke tokens), with `patterns/strokes.json` mapping
  each token to a stroke in the kit. `pnpm patterns` compiles them into
  `src/engine/patterns.data.ts`, which is committed; `pnpm patterns:check`
  runs in `make test` and fails on drift. The parser stays out of the bundle,
  where it would cost 78 KB gzipped, and the compiler checks a pattern fills
  its cycle and that its shape and cycle agree. Five bugs found on the way are
  filed as notations#17 to #22.
- **Arrangements** (`engine/arrangement.ts`) decide what each cycle plays. A
  pattern's `role` is `main` or `variation`; `arrangementFor` gathers the
  alternates that fit the same cycle, and `patternForCycle` draws one per
  cycle at the Variety setting's chance (off, 0.3, 0.7). The first cycle is
  always the main one. A `korvai` role is an ending: the Korvai button hands
  the next cycle to it, and it resolves on the sam after, which is how an
  accompanist closes a section. The kit asks per cycle through `StrokeSequencer`'s
  source, and keeps a lane per cycle so the lane changes when that cycle is
  heard, not when it was booked. Variety is saved per kit under
  `thambura.kit`, taken once from `thambura.player`, where the tala kept it.
- **The stroke lane** (`player/StrokeLane.tsx`) shows the cycle's aksharas
  and lights the stroke being heard. `Pattern.aksharas` says how many cells a
  cycle divides into (seven for a misra chaapu, which our tables call one
  beat), `StrokeEvent.index` says which stroke sounded, and the kit queues
  a cue per stroke so the lane lights from `heardNow` like the beat images.
  `engine/lane.ts` lays a pattern out for it. It still sits under the beat
  image and reads the kit's state; where a track's panel goes is #101.
- **A kit can derive a stroke from another.** The gumki is `L.thom` with a
  bend (300 cents over 0.25 s, a guess), declared in the manifest rather than
  recorded, since a gumki is a bent thom and the dataset has no take for it.
  `strokeSound` resolves the takes of the stroke it bends, and `play` applies
  the bend. Arai chapu and the left-hand tha are still missing and need
  recording; note that this kit's `tha` is the right head's closed stroke,
  not karya's left-hand `p`.
- Drum strokes choke per head: a closed stroke cuts the ring of the last open
  one on the same head, never the other head. `play` takes `chokeFade` for
  that (8 ms, against the strings' 80 ms) and `bend`, which slides a note's
  detune for the gumki. Takes go round per stroke, with a little gain jitter.
  Trimmed mono samples matter, since decoded PCM is about 190 KB/s mono.

## Docs site

`docs/` is the developer docs site, published to GitHub Pages at
https://panyam.github.io/thambura/, to move to docs.thambura.com later (#95;
the design docs sit apart in `docs/designs/`). It is s3gen, laid out like
notations' docs, and `docs/README.md` covers writing a page and the steps for
the move. It is its own Go module, so s3gen stays out of the app's go.mod and
build, and the app neither serves nor deploys it. `make docs` checks and
bundles `docs/components` with web's tsc and esbuild, then writes the site to
`docs/dist/` (gitignored). `make docsrun` serves it on :8012 with live reload.
`make test` builds it and fails on a broken link, a link missing the
`/thambura` prefix, or a template error: s3gen writes a failed page's error
into the page and carries on, so the build checks the output for it. `make
ghpages` publishes, by force-pushing the build as the one commit on
`gh-pages`. Every page is `noindex` until `SiteMetadata.json` says otherwise.

## Deploying

`make deploy` runs the tests, a minified frontend build and a Go build, then
`gcloud app deploy` to the `thambura` project (`GCP_PROJECT=... make deploy`
to override). It refuses to run with active `replace` directives in go.mod.
The runtime is `go126` in `app.yaml`, which has to be at least the `go` line
in go.mod. App Engine serves `/static` itself (`static_dir: web/static`) and
forces HTTPS.

`make deploydev` is the same build, sent to the `dev` version of the same
project with `--no-promote`, to click through on a real App Engine before
thambura.com gets it. It takes no traffic and has its own URL,
https://dev-dot-thambura.uc.r.appspot.com, which the target prints from
`gcloud app versions describe` (the appspot hostname is regionalized here but
not on older apps, so don't build that URL by hand). The version id is reused,
so dev deploys don't pile up the way `make deploy`'s timestamped ones do.
Staying in the real project is the point: the test copy runs with the project's
own service account, region, quotas and `app.yaml`. `DEV_PROJECT` sends it
somewhere else instead (`layagnana` has an App Engine app, serving the 2016
site at `layagnana.appspot.com`), `DEV_VERSION` renames the version, and
`make devlogs` tails whichever it was.

Traffic only moves with `PROMOTE=1`, and `checkpromote` refuses that in the
project serving thambura.com, before the tests run: `make deploy` is the way to
put a build there. `web.Staging()` keeps a test copy out of search, through
`SiteHandler` marking every page `noindex` and `robots.txt` serving
`Disallow: /`. It reads two App Engine variables: `GAE_VERSION`, since a dev
version sits in the real project (App Engine names a real deploy's version
after the time, so it never starts with `brand.DevVersionPrefix`), and
`GOOGLE_CLOUD_PROJECT` for a deploy to another project. Neither is set locally.
The `/static` and `/legacy` handlers are App Engine's own on a deploy, so that
header doesn't reach them (`/legacy` has it from `app.yaml` anyway).
`brand.URL` is a constant, so the dev copy's canonical link, share links and OG
image still point at thambura.com.

The dev container has `gcloud`, signed in as the project's owner, so
`make deploy` runs from here. It takes a few minutes: the tests, a minified
build, then the upload. gcloud copies the whole tree to a temp directory
first (17k files with `web/node_modules` in it, which is slow and noisy in
the log), but `.gcloudignore` keeps `node_modules`, `web/src` and the tests
out of what is uploaded and deployed.

One-time setup, run by an owner of the project from a machine with `gcloud`:

1. `gcloud app create --project thambura --region <region>` if the project
   has no App Engine app yet. The region can't be changed later.
2. `make deploy`, then check https://thambura.appspot.com. The first deploy
   turns on Cloud Build and Artifact Registry and can fail with `[13] an
   internal error has occurred` (the gcloud log says `invalid bucket
   "staging.thambura.appspot.com"; service account ... does not have access`).
   The new service-account grants hadn't taken effect yet. Wait a minute or two
   and rerun.
3. `make verifydomain` opens Search Console to prove you own thambura.com,
   via a TXT record at the registrar. It has to be the same Google account
   that deploys.
4. `make domains` maps thambura.com and www.thambura.com with Google-managed
   certificates, and prints the DNS records to add at the registrar (A and
   AAAA records for the bare domain, a CNAME to `ghs.googlehosted.com` for www).
   It skips names that are already mapped, so rerun it to reprint the records.
5. `make domainstatus` shows the mappings. The certificates are issued once
   DNS resolves, which can take a few hours, and HTTPS on the custom domain
   fails until then.

To check which build is live, compare the served bundle with a fresh one:
`(cd web && pnpm build)`, then
`curl -s --compressed https://thambura.com/static/app.js | cmp - web/static/app.js`.
Identical means the site runs this commit.

DNS for thambura.com is on Namecheap (BasicDNS, `dns1/dns2.registrar-servers.com`).
The records were set on 2026-09-18 through the Namecheap API
(`NAMECHEAP_API_USER` / `NAMECHEAP_API_KEY`, which only work from IPs
whitelisted under Profile > Tools > API Access; the dev container's public IP,
98.248.54.110, is on the list). `namecheap.domains.dns.setHosts`
replaces every record at once, so any change must read with `getHosts` first
and write back the merged set, passing `EmailType` through. Otherwise the
`google-site-verification` TXT record and email forwarding are lost. Namecheap
published the change within a minute.

## Working alongside other sessions

Several Claude sessions often work in this checkout at once. A branch switch
here changes which branch everyone commits to (two doc commits once landed on
the wrong PR that way), and `git add -A` sweeps up someone else's half-done
edits. So:

- Don't switch branches in the shared checkout. Start each piece of work in
  its own worktree: `git worktree add -b <branch> <dir> origin/master`, then
  `cd <dir>/web && pnpm install`. A worktree gets its own `node_modules`,
  and its own `tools/sound-analysis/.venv` if you're running the sound
  analysis; both are gitignored, so a new worktree starts without them.
- Stage explicit paths, and check `git status` for files you didn't touch.
- Serve a worktree on its own port: `(cd web && pnpm buildcss && pnpm build)`,
  then `PORT=8011 go run .` from the worktree root. Check the port is free
  first (`ss -ltnp | grep :8011`): other sessions keep servers on 8001 and
  8002, and a clash leaves the old server answering. Whatever runs on :8000
  is serving the shared checkout's branch, which may be stale.
- A `go run` server outlives a removed worktree and then answers every page
  with "Template render error" (its templates are gone). Stop your servers
  before removing a worktree.
- Put `pr-assets` screenshots through a worktree of `origin/pr-assets` too.
- Other sessions' work moves any timing you measure here: the same render
  benchmark reads 282 ms on a quiet container and 434 ms at load average 3.5.
  So measure the before and the after back to back, minutes apart at most, and
  quote the ratio or the nanoseconds per unit of work rather than wall-clock
  milliseconds. `uptime` tells you what you were competing with.
- If another session's work is affected, tell it with SendMessage.

## PRs

Follow the `start_pr` description format. For before/after evidence:

- **Screenshots** go on the orphan `pr-assets` branch under `<pr-branch>/`, not
  in the PR branch. Link them as
  `https://github.com/panyam/thambura/blob/pr-assets/<path>?raw=true`. When
  pushing a commit there by hash from zsh, brace the variable
  (`git push origin "${c}:refs/heads/pr-assets"`), since zsh reads `$c:r` as
  a filename modifier.
- **The old app** is at `/legacy/` on any running server.
- **Audio timing** is measured by wrapping `AudioBufferSourceNode.prototype.start`
  in an init script and recording each `when`. That captures the scheduled audio
  time; image-change timing only shows animation-frame jitter.

## Checking in a browser

Playwright's Chromium is at `~/.cache/ms-playwright/chromium-1234/`, and
`playwright-core` can be required from another project's node_modules (e.g.
`../Agni/main/web` or `/workspace/repos/projects/sdlold/web/frontend`). Launch with `--autoplay-policy=no-user-gesture-required`.
The tala's transport buttons are icons, so select them by label:
`button[aria-label="Start"]` (or "Stop", "Restart", "Previous beat"). With
`getByRole`, pass `exact: true`: name matching is a substring match, so
"Start" also finds Restart. The
thambura opens with the floating `#thambura-toggle`, its views are
`button[role="radio"]:has-text("Raagini")` and so on, its mode is
`select[aria-label="Sound"]`,
`button[aria-label="Copy link"]` copies the
page's `?s=` link (give the context the clipboard permissions to read it back;
a fresh context opening that URL is the second listener), the Lab's controls are ranges labelled by field
(`input[aria-label="Attack"]`, tabs under `[aria-label="String"]`, mute dots
`button[aria-label="Mute string 3 · Sa"]`, `select[aria-label="Copy"]`) with the
plan in `textarea[aria-label="Settings JSON"]`, and presets are saved with
`input[aria-label="Preset name"]` plus Save or Save as…. Built-in sounds are
`mode:<id>` in `select[aria-label="Sound"]` and presets are their ids under
`optgroup[label="Saved"]`. Each string pans to its own place, so wrapping
`StereoPannerNode`'s `pan` setter tells you which string a pluck was.
It plays with the floating
`#thambura-play`, or `page.keyboard.press("t")`. Once the bar is open, the
floating pair fades out and goes `inert` (the bar carries the same two
controls), so drive the bar's own buttons then: scope to
`[role="region"][aria-label="Thambura"]`, and hide it again with
`button[aria-label="Hide thambura"]`. The theme toggle cycles system, light,
dark, so dark takes two clicks (or launch the page with `colorScheme: "dark"`).

A few probes that worked, all set up in an init script:

- Wrap `AudioParam.prototype.linearRampToValueAtTime` / `setTargetAtTime` to
  count choke fades and the Stop release, and `createStereoPanner` to read
  pans.
- A `PerformanceObserver` for `longtask` shows any main-thread stall over
  50 ms, which is how the render slicing was checked with the tala playing.
- Headless Chromium can't test a real wake lock or audio session, so define
  stand-in `navigator.wakeLock` and `navigator.audioSession` objects and log
  the calls.
- `playwright-core` has to be loaded with `createRequire(...)("playwright-core")`.
  Importing its `index.js` from an ESM script gives an object whose `chromium`
  is undefined, and the failure reads as "Cannot read properties of undefined".
- Cold Start is measured by wrapping `AudioBufferSourceNode.prototype.start` in
  an init script, clicking `#thambura-play` and waiting for the first booked
  pluck: 375 ms on master before #62, 225 ms after. Serve the branch and the
  base on two ports and alternate between them, for the reason above.
- `pkill -f <pattern>` can match the shell running it and kill it, and
  `fuser` isn't installed. Find a server by its port instead:
  `ss -ltnp | grep :8011` gives the pid; kill it and its `go run` parent
  (`ps -o ppid= -p <pid>`). **Check the port is free afterwards.** A
  `fuser -k` that silently did nothing leaves the old server holding the
  port, the new binary fails to bind, and the browser keeps being served by
  the old build. That looks like a code bug, not a stale process: a page
  rendered by yesterday's binary against today's template gave
  `can't evaluate field KitURL in type *web.HomePage`, which cost a while
  before the log line `bind: address already in use` explained it.
