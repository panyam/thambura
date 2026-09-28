# Thambura

A music-practice app (tala keeper and thambura drone today; mridangam next). Go
serves goapplib page shells; a Solid island does everything in the browser.
There is no server-side data.

## Commands

```sh
make run         # ui + go run on :8000 (8080 is taken in the dev container)
make test        # go test ./... ; pnpm typecheck ; pnpm test (vitest) ; pnpm buildcheck
make ui          # pnpm install, Tailwind -> web/static/css/tailwind.css, esbuild -> web/static/app.js
make templates   # templar get: re-vendor goapplib templates after a ref bump
make devkit      # copy an instrument kit in from ../mridangam-data (gitignored)
make setupvenv   # one Python venv at ../.venv, shared by every worktree
make deploy      # tests + prod build, then App Engine project thambura (see Deploying)
make deploydev   # the same, to a no-traffic "dev" version, to try before thambura.com
make prodlogs    # tail App Engine logs
```

Built assets (`app.js`, `static/chunks/`, `tailwind.css`, `web/bundle.json`)
are gitignored. `.gcloudignore` exists so a deploy still uploads them.

**The bundle is split** (#91). `web/build.mjs` builds `app.js` with
`splitting`: the Lab and Raagini views load on first use from
`static/chunks/`, behind a "Loading the Lab…" indicator, and code they share
with the app goes into shared chunks that `app.js` imports up front. Three
things keep that from making a first visit slower or a deploy break a page:

- The build writes `web/bundle.json`, the chunks `app.js` imports before it
  runs, and Go (`internal/web/bundle.go`) reads it at startup and puts them in
  every page's `<head>` as `<link rel="modulepreload">`. Without that the
  browser finds them one after another, and a first visit measured slower
  than an unsplit bundle. The manifest is outside `static/` because App
  Engine serves that folder itself and the Go app can't read it. After a
  `pnpm watch` or `pnpm build` the server's copy is stale until it
  restarts: the page preloads chunk names the rebuild deleted, and the
  console shows a 404 per chunk. Restart the server after rebuilding before
  counting console errors in a browser check.
- The service worker precaches every script the build wrote (the list comes
  from esbuild's metafile, `scripts/shell.mjs`), so the lazy views open
  offline after one visit and an old worker always holds an `app.js` and the
  chunks it asks for.
- `app.yaml` makes `/static/*.js` revalidate on every load and keeps
  `/static/chunks/` for a year (their names are content hashes). Otherwise a
  browser holding a pre-deploy `app.js` would ask for chunks the deploy
  removed. The build empties `static/chunks/` first, since esbuild never
  deletes.

The build has two entries: `app.js` for our pages and `embed.js` for other
sites (#92, below). They share chunks, `bundle.json` has an entry for each,
and both keep fixed names, since other sites link to `embed.js`.

The pluck worker (`static/pluckWorker.js`, #39) is a third build, a classic
script like `sw.js`, so it shares no chunks; the service worker precaches it.

`pnpm buildcheck` (in `make test`) builds into a temp folder and checks all
of this: the views are in chunks, the worker precaches every script, stale
chunks are gone, `bundle.json` matches what each entry imports,
`embed.js` carries none of our page chrome and shares chunks with `app.js`,
and the pluck worker is a classic script with no page code in it.

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

- **The home page** (#101) is the tala and the track list
  (`layouts/Tracks.html`): the tala across the top (its `wide` config puts
  the beat and transport on the left and the strip and selects on the
  right from `lg` up), a full-width row per instrument under it, and the
  floating `#play-all` (Start all) at the bottom right. The tala's
  `instrumentControls: false` keeps the claps' controls and the kit's lane
  and pad in their rows. There's no drawer any more: the thambura's panel
  opens under its row's toggle.
- `internal/web/pages.go`: `NewApp` loads templates through templar's
  `SourceLoader` (`web/templates/templar.yaml` maps `@goapplib/` to the vendored
  copy in `templar_modules/`, which is committed). `HomePage` embeds
  `goal.BasePage` plus a `Header` struct for goapplib's header, and a
  `page.Spec`.
- **Page spec** (#89): `internal/page` describes what a page starts with, its
  islands (views: a name, a `data-slot`, a presentation and config) and the
  instruments it seeds (a kind and config). `homeSpec` in `pages.go` builds
  the home page's: the islands, then the instruments `startingInstruments`
  seeds on every page with a tala, `hands`, `thambura` and a `kit` per kit
  found, which the browser numbers by kind (`hands-1`, `thambura-1`,
  `kit-1`). The partial
  `web/templates/page/Islands.html` writes it as
  `<script type="application/json" id="page-spec">`, and all island config
  travels there, never in `data-*` attributes. `internal/page` and
  `web/src/page/` import nothing else from this repo (`make liftcheck`, part of
  `make test`), since they're meant to move into goapplib and tsappkit after
  #92.
- Templates come in three layers. `web/templates/BasePage.html` extends
  goapplib's BasePage: our logo, no login actions, no HTMX, no header drawer.
  A layout (`web/templates/layouts/Tracks.html` for `/`) includes it, defines
  `BodySection` with the slots and `PageScripts` with the spec, and asks the
  page for `PageContent`. `HomePage.html` is only that content (a one-line
  heading linking to `/about`) plus the include. Go templates reject a second definition, so none of
  these can give another's blocks defaults.
- Search and link previews: pages render a `SitePage` (goapplib's
  `BasePage` plus our `Header`, `Social` and `StructuredData`), and
  `BasePage.html` turns it into the canonical link, Open Graph and Twitter
  tags, icons, manifest and JSON-LD. Absolute URLs come from `brand.URL`
  (`https://thambura.com`), so the www and appspot copies point at it. Go
  serves `/robots.txt`, `/sitemap.xml`, `/favicon.ico` and `/sw.js` (the
  service worker has to come from the root to cover the site, and goes out
  with `Cache-Control: no-cache`). `HomePage.html`
  keeps one short line under the player, the page's only `<h1>` and the only
  text a crawler that doesn't run JavaScript sees; the full description is
  `/about` (`AboutPage.html`, in the sitemap, linked from the header). The PNGs
  (`web/static/og.png`, `web/static/icons/`, `favicon.ico`) come from
  `node design/render-images.mjs` (preview layout in `design/og.html`),
  which needs `PLAYWRIGHT_CORE` and `CHROMIUM` pointed at an install.
- **Labs** (#90, `internal/web/labs.go`): layout experiments on the live site
  under `/labs/<slug>`, listed at `/labs/`. (The track list was tried as
  `/labs/tracks` before it became `/` in #101.) The `labs` slice drives both the
  routes and the index. Each labs page is its own goapplib page type with a
  template under `web/templates/labs/`, and they all sit on one mux wrapped
  in `noindex`, with a canonical link to `/` and no sitemap entry. Every
  labs layout shows the `LabsBanner` strip (`layouts/LabsBanner.html`). A
  labs page shares the instruments and their settings with `/`; only
  layout state would be its own, and none has any yet. `/labs/side-by-side`
  (`layouts/SideBySide.html`) puts the tala and a docked thambura in two
  columns from `lg` up and stacks them below that.
- **Embedding** (#92, `internal/web/embed.go`): `/embed/demo` is a page
  written the way another site would write one, with no BasePage, header,
  `app.js` or `tailwind.css`: a `data-thambura-spec` script, a
  `data-thambura-slot` element per island, and `/static/embed.js`. It's
  noindexed and preloads `embed.js`'s chunks from `bundle.json`. Go's
  `/static/` handler and all three `/static` handlers in `app.yaml` send
  `Access-Control-Allow-Origin: *`, since a module script, its chunks and
  `fetch()` of fixtures and sounds from another origin need it.
- `/legacy/` serves the 2016 app from `web/legacy/`, copied from the
  `pre-sadhana-port` tag with its `/static/` paths moved under
  `/legacy/static/` (see `web/legacy/README.md`). Nothing links to it from
  the app; it links back. `app.yaml` needs a separate `static_files` line for
  `/legacy/`, since `static_dir` serves no index page. Both it and the Go
  server send `X-Robots-Tag: noindex` for `/legacy`.

## Frontend (web/src)

Things that have bitten:

- **Pass presenter methods wrapped, not bare.** `onChange={a.setVariety}` in
  JSX loses `this`, so the method throws on `this.state`. Write
  `onChange={(v) => a.setVariety(v)}`. The control looks like it works while
  the console fills with "Cannot read properties of undefined".
- **The web tsconfig has no `@types/node`**, so a vitest test can't use
  `node:child_process` or `process`. Checks that need them belong in the
  Makefile instead: `pnpm patterns:check` runs there, not in vitest.
  vitest does pick up `web/scripts/**/*.test.mjs` (plain ESM, no types), so
  a build helper's pure logic is tested there (`scripts/shell.test.mjs`) and
  only its file-system half goes in `pnpm buildcheck`.
- **Key a `For` by something stable.** `<For each={rows}>` matches items by
  object, and a presenter that returns fresh objects on every change (the
  track list does) makes Solid tear down and remake every row on each
  update, losing whatever state the row held: an open panel closed on every
  mute or solo until #149 keyed the rows by id (`each={rows.map((r) =>
  r.id)}`, looking the row up inside).
- **No formatter is configured.** The code runs long lines (up to about 270
  columns in the JSX). `npx prettier` falls back to 80 columns and rewraps
  whole files, burying the change in the diff; don't run it.
- **Measure a performance change before trusting it.** Splitting the bundle
  (#91) made a first visit *slower* until the shared chunks were preloaded,
  because the browser found them one after another. A throttled Playwright
  load (CDP `Network.emulateNetworkConditions`, and
  `Emulation.setCPUThrottlingRate`) against master on another port showed it;
  the byte count alone said the opposite.

The design docs are in `docs/designs/`; `docs/` itself is the developer
docs site (see Docs site below). `docs/designs/architecture.md` explains how the sounds are made and timed, timed vs
continuous voices, and what changed from the 2016 app. `docs/designs/layouts.md` and
`docs/designs/library.md` are plans, not descriptions: where the thambura could sit,
and what it would take to import these pieces from another project.
`docs/designs/solkattu.md` is a plan too: patterns written in solkattu and
realized into strokes through karya's phrase table, which
`karya/phrase_tally.py` in thambura-ext tallies from a karya checkout.

**Other projects' formats live in thambura-ext** (`panyam/thambura-ext`,
public, checked out at `../../thambura-ext/main`): anything tied to one
outside project, like parsing karya's Haskell. What it produces comes in
here as a clean file with its source noted. A tool that works on any input
of its kind stays here, even when the input sits in another repo (the sound
analysis, `make devkit`). Recordings, datasets and kits are thambura-data.
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
  from a beat's name to a file, resolved against the fixtures' own URL, so
  its `/static/...` paths stay on our origin when another site embeds us. (The 2016 app's SaRiGaMa groups, a random
  tick and a random swara image per beat, were dropped with their per-step
  random draw.) The player opens on the first sound and
  image group in the fixture, so group order there sets the defaults (Right
  hand for images). The Right hand and Left hand image sets
  are SVGs generated by `node design/hands.mjs`; edit the script and rerun it
  rather than editing the files. "one" lights the little finger and "five"
  the thumb, as in Simple.
  Edit `TalasFixtures.json` as text, not through a JSON round trip: the file
  is hand-formatted (`" ,"` separators, a tab), and re-serialising it
  rewrites every line and buries the change.
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
  performance change's clothes, and the fingerprints are there to catch it.
  Such a change also bumps `RENDER_VERSION`, since browsers keep rendered
  plucks under it between visits (#40); a test digests the fingerprints per
  version and fails until the bump and its new row are in. A change to a
  voice's values needs no bump, since the cache's key holds them. A
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
  leave every other byte alone. Nothing sets it since the drawer went (#101),
  but old links carry it and it stays in the format. A Custom plan is stored as edits
  to the closest built-in plan (or field by field, whichever is shorter),
  with a checksum of that plan so a link made before a built-in sound
  changed can say so. Slider values take a byte or two; anything off a
  slider's step, and voice values the Lab hides, travel as exact floats.
  Links run 18-32 characters for everyday setups and stay under 200 for a
  plan edited everywhere. The orders at the top of the file are the format:
  append, never reorder, and bump `FORMAT` for anything else. Format 2 is a
  page link (#100): one part per instrument, keyed by its page id, each a
  kind, a number, a length and a payload; a thambura's payload is a whole
  format 1 link. A `session-1` part (#101, `encodeSession`) carries the
  tala, speed and shruthi in 11 bytes, and its shruthi wins over the
  thambura part's key; every page writes one, so today's links are format 2
  (about 60 characters with a thambura). The claps (`encodeHands`: volume
  and the sound group's name) and each kit (`encodeKit`: which of the
  page's kits, Variety, volume, on) have parts too; each instrument's
  `applyShared` plays a link's setup without saving it. `encodePage` would still write a
  lone `thambura-1` as format 1, and `decodePage` reads a format 1 link as
  `thambura-1` and skips parts it can't read.
  The docs site's reference page (`docs/content/reference/share-link-format/`)
  describes both. `shareLink.test.ts`'s "format 1 links keep opening the
  same" holds links as they were sent, with what they decode to; the
  round-trip tests can't see a reordered table, since both halves use it,
  and these can.
- `thamburaSequencer.ts` plucks first, Sa, Sa, low Sa in a `PluckPattern`:
  `EVEN_PATTERN` (four slots and a rest) or, for the jawari mode,
  `PLAYED_PATTERN` (the recorded player's uneven gaps, plus a `DampEvent`
  that stops each string shortly before its next pluck). It works out each
  event's time only when asked, so a speed change is heard at the next pluck.

**player/** is the browser side:

- `audio.ts` (`AudioEngine`): one AudioContext, created in `buildContext`
  (`islands.ts`) and shared by every island. Every note plays on a track (`TrackId`, a string;
  `Bus` is the old name for it), made the first time its id is used: a level,
  an on/off gain that mute and solo set, then a pan, into a master gain, a
  limiter and the speakers. `setLevel`/`setBusVolume`, `setPan`, `setMute`,
  `setSolo` and `removeTrack` work per track; the hand claps play on
  `hands-1`, the thambura on `thambura-1`, and each kit on its page id (`kit-1`). The track's pan node
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
  tracks share one start time and, when given one, a `TempoMap`. `onStop`
  tells a voice that books sounds without a sequencer of its own (the hands
  track) to take them back. The 25/100 ms numbers are
  the defaults from "A Tale of Two Clocks" (web.dev), not tuned. They tolerate
  about 75 ms (look-ahead minus interval) of main-thread stall before a note
  plays late. A late note is clamped to `currentTime`, and later notes stay on
  the grid. Tempo isn't limited by the window: at 300 bpm with sankeernam ticks
  about 22 ms apart, every tick still gets its exact audio time.
- `presenter.ts` (`PlayerPresenter`): owns the engine, plays on the page's
  clock (a required `clock` dep, so the tala and a kit can't end up on two),
  and publishes its cycle there (`clock.tala`: the `TalaGrid`, the nadai, and
  `resumesAt`, the count into the cycle it starts from, set on every rebuild
  and every Start). It knows nothing about instruments and makes no sound:
  each tick it books is called on `clock.ticks` (its sound's name and time)
  for the hands track to play, and each step becomes an image cue, shown in a
  `requestAnimationFrame` loop once `heardNow` reaches it. The same loop
  sends the image's pose through `PlayerView.setPose`, a signal apart from
  `PlayerState`, so a frame only restyles the image. The beat ends at the
  next booked step, or at the `TempoMap`'s time for it before it's booked.
  The student's choices (motion, tala settings, tempo and image group) are
  saved in localStorage under `thambura.player` on each
  change, never while loading, and restored through `normalizeSettings` and
  the catalog, so a stale value falls back to its default. It doesn't import
  Solid, and its tests run it under fakes. `buildContext` makes it (as
  `ctx.tala`), not its island, since the session strip and the page link
  need it too; `applyShared` plays a link's tala and speed without saving
  them, and `watch` hears every state change beside the view.
- `session.ts` (`SessionPresenter`) and `SessionStrip.tsx`: what the page
  shares rather than one instrument (#101), in a strip under the beat
  image. The speed is the tala's and the shruthi the page's `Shruthi`; the
  strip shows them iTanpura's way (the note between semitone arrows, a fine
  tune between ♭ and ♯, the note opening all 15 keys with a dot where a kit
  would sound stretched, `KitPresenter.stretchedAt`), plus Start all (the
  tala and the thambura together, or stop everything). It writes the page
  link's `session-1` part on every change, but not on each beat's state
  update. `startingPitch` picks the shruthi a page opens on: a shared
  session part, a shared thambura part, `thambura.shruthi`, the saved
  thambura's key, C. On our pages (`main.ts`, `wireSessionKeys`) Space is
  Start all and Shift+↑/↓ steps the shruthi (`shortcuts.ts`,
  `pageShortcut`); Space leaves a focused button alone, since it presses it.
  `sessionIsland.tsx` mounts the strip alone, as the `session` island.
- `handsPresenter.ts` (`HandsPresenter`): the hand claps as a track,
  `hands-1`, seeded by Go as a `hands` instrument in the page spec. It loads
  the fixture's sound groups, plays each call on `clock.ticks` from the
  chosen one, cancels its track on `transport.onStop`, and keeps Sounds and
  Volume under its id, `thambura.hands-1` (taken once from `thambura.player`). The
  claps stay a fixture of sound groups rather than a kit: the tala decides
  which sound each tick is, and Previous/Next play one beat at once, which a
  kit's own sequencer can't. Talas are their own group, not instruments;
  several at once is later (`docs/designs/instruments.md`).
- `PlayerView.tsx`: renders `PlayerState` and calls the presenter's intents.
  In order: the image, the transport right under it, the kit's lane, the
  session strip, the tala's selects, then Animation and Images (how the
  beat looks matters less than what it is). `wide` (the island's config)
  splits it into the beat on the left and the rest on the right from `lg`.
  Its Sounds menu and Volume slider are the hands track's, the lane,
  Variety and Korvai the kit's, and the speed the session strip's; all come
  in as props. `Stepper.tsx` is the slider between − and + both use.
  `island.tsx` wires the real browser dependencies in. `islands.ts` holds
  the island registry (`tala`, `thambura`, `session`) and `buildContext`, which both
  entries use: `main.ts` for our pages, through the generic
  `web/src/page/islandPage.ts` (a tsappkit `BasePage`, which also wires the
  theme toggle), and `embed.ts` for other sites. Both mount through
  `mountIslands`, which logs and skips an unknown island, a missing slot or
  a factory that throws, and builds the context only when there's an island.
- `embed.ts` (`/static/embed.js`) is the tala and the thambura on someone
  else's page. It finds a host's `data-thambura-spec` script
  (`page/embedSpec.ts`), mounts each island in a shadow root holding our
  stylesheet (`page/shadow.ts`), so the host's CSS and ours stay apart, and
  runs their lifecycle through tsappkit's `LifecycleController`, since there's
  no page class. It also exports `mount(spec, opts)`. Everything resolves
  against its own `import.meta.url`: fixtures, sounds, kits, the lazy views.
  `embedDefaults.ts` seeds the instruments a host's islands need (the
  thambura, and the hand claps for a tala), since only our Go pages seed
  them. Its `PageLink` writes to no address bar and makes Copy link URLs on
  the app, the thambura doesn't take the T key from the host's page
  (`pageKeys: false`), and an embed always docks it.
  Dark mode inside a shadow can't see the host's `.dark`, so it follows
  `prefers-color-scheme` or the spec script's `data-theme`.
- `pageContext.ts`: what every island shares, services rather than
  instruments: `audio`, `clock` (one `Transport` on one `TempoMap`,
  `createClock`), `tracks` (the instruments playing, by id: `hands-1`,
  `thambura-1`, `kit-1`; `onChange` hears adds and removes), `trackList`
  (below), `shruthi` (`Shruthi`, the page's Sa: key, fine
  tune and A4, saved as `thambura.shruthi`; the thambura plays to it and
  moves it, a kit follows it, the strip shows it), `tala` and `session`
  (above), `awake`, `link`, and `assetBase`, what the spec's URLs resolve
  against (the page on our site, `embed.js` on another). `buildContext`
  fills `tracks` from the spec's instruments, loading only the first kit for
  now.
- `trackList.ts` (`TrackList`): which instruments are on the page (#101),
  adding and removing them, and mute and solo through the mixer. It starts
  the page with a shared link's instruments (the parts present, the claps
  always), else the list saved under `thambura.tracks`, else one of each
  kind the spec offers (the first kit only). Only a page with a `tracks`
  island saves or reads a list; `/` always starts with the spec's
  instruments. `buildContext`'s `make` builds each instrument (its track,
  clock, shruthi and link part) and returns a `dispose` that undoes it all:
  `KitPresenter.dispose` leaves the clock (`Transport.remove`, the tala
  unfollowed), `ThamburaPresenter.dispose` cancels renders in flight and
  drops its samples, and both remove their audio track. Remove clears the
  instrument's saved record (`clearInstrument`, which for `thambura-1` also
  drops the pre-id `thambura.drone`), with Undo for `UNDO_MS`; adding it
  back by hand starts fresh. The claps can't be removed. Only one thambura
  (#103), and each kit once. `TrackListView.tsx` draws a full-width row per
  instrument: name, main controls (the thambura's round length among them),
  level, mute and solo icons, and a toggle that opens its panel (the
  thambura's, or the kit's pad) and Remove, which lives only there. The
  kit's stroke lane sits under its row while it plays. Rows are keyed by id,
  since the list makes new row objects on every change and a row remade
  would close; while any row is soloed the rest fade. `tracksIsland.tsx`
  mounts them; `watched.ts` makes a presenter's state a signal through its
  `watch`, since a kit can show in the tala's lane and in its row at once
  (the kit, claps, tala and thambura all have `watch`).
- `storage.ts`: every localStorage key goes through here. An instrument
  keeps its state under its page id (`instrumentStore(id)`:
  `thambura.thambura-1`, `thambura.kit-1`, `thambura.hands-1`); the page's
  own keys (`player`, `presets`, `shruthi`, `tracks`) are named. `thambura-1` reads the
  pre-id `thambura.drone` record once through `withFallback`, which writes
  only the new key. (`thambura.drawer`, the drawer's open state, is no longer
  read or written.)
- `pageLink.ts` (`PageLink`): the page's share link in the address bar
  (`?s=`, `replaceState`, 400 ms after the last change), made of one part
  per instrument. An instrument gets its own with `part(id)`: it reads its
  part of the link the page was opened with, and each write rewrites the
  page link from every part, keeping the parts it was opened with until
  their instruments write, each part as its instrument wrote it. `opened(id)`
  and `openedIds()` are the link as the page was opened, which the track
  list reads for which instruments to start with, after the instruments have
  written their own parts. `remove(id)` drops a part when its instrument goes.
  `url(id, setup)` is Copy link's URL: the page link with that part swapped
  in. It's in the page context, since the link is the page's, not one
  island's.
- `thamburaPresenter.ts` (`ThamburaPresenter`): a thambura as an instrument
  on the page, with an `id` (`thambura-1`, seeded by Go as a `thambura`
  instrument and made in `buildContext`, not by its island). It has its own
  `Transport` (so it starts and stops apart from the tala), the plucked
  (tambura, guitar) and reed (sruti) voices on the audio track named by its
  id, and the view and the Custom plan, saved under that id.
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
  sets the sound but not the view, volume or the page's shruthi.
  `deps.shruthi` is the page's `Shruthi`: the thambura starts on it over
  its own saved key or link, follows it, and sets it when its own key, fine
  tune or A4 changes, so the Studio keyboard and the strip move together. Opening a link that changes a
  saved setup first keeps it as the "Before shared link" preset (only the
  latest). Pitch and timbre
  changes re-render the plucks once nothing has changed for 100 ms (each
  change restarts the wait, so a knob turned through six keys renders only
  the last), and Start renders at once and waits for them. The presenter
  asks a `PluckRenderer` (`pluckRenderer.ts`) for every missing sample key
  at once and swaps the strings over when all have arrived; a change cancels
  at once any render whose key it no longer needs, and keeps the ones it
  still does. On the page that's `WorkerPoolRenderer`: up to four workers
  (`static/pluckWorker.js`, over `pluckWorkerCore.ts`), started on the first
  render, each slicing its job so a cancel lands within about 4 ms. When
  another site embeds us, the worker is a blob that `importScripts` ours,
  since a browser won't start a worker from another origin. If a worker
  can't start or fails, everything goes to `SlicedRenderer`, the old
  main-thread path (slices on `deps.defer`), which the presenter tests use
  too. Over the pool sits `CachedRenderer` (`pluckCache.ts`, #40): it looks
  each pluck up in IndexedDB (`thambura-plucks`) first, renders only the
  misses, and writes them back a second after they're playing. Its key
  (`pluckKey`) holds the engine version, sample rate, seed, pitch and every
  voice value exactly, unlike the presenter's rounded one. `LruPluckStore`
  keeps it under 60 MB, least recently used out, writes one at a time (a
  setting's three plucks arrive together), and drops other versions' entries
  on opening. Any IndexedDB failure is a miss. A returning visitor's Start
  renders nothing: 66 to 23 ms to the first pluck. After a deploy that bumps
  the version, the first visit still runs the old build from the service
  worker's cache, and the one after re-renders. Fine tune is only `detune`. In both tambura modes the
  second Sa string plays 1.5 cents sharp, so the pair beats slowly. Damp
  events fade a string over 0.2 s through `audio.damp`, which marks the note
  released so the re-pluck's choke leaves it alone. Sruti mode
  mixes its three tones swara-first (0.40 / 0.25 / 0.08, panned apart), since
  the octave Sa's otherwise fuse into one note and bury the swara.
- `ThamburaPanel.tsx` is the thambura's controls wherever a page puts
  them: `ThamburaDocked` in a slot of its own (the `thambura` island, on
  `/labs/side-by-side` and in embeds), or under the thambura's row's toggle
  on `/`, where `compact` leaves out the start/stop button and the Sound
  menu the row already has. The panel's header holds the one start/stop button
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
  columns (`break-inside-avoid`). Each string tab has an on/off dot and there's Solo (the
  presenter's `muted`, cleared on leaving the Lab and kept out of links), and
  "Copy…" gives the selected string another's sound (`copyString`) or copies
  it to all. `ThamburaScope` draws what the thambura's track plays from
  `AudioEngine.analyser(presenter.id)`: the level over 8 s in dB, 40 ms of wave,
  and the spectrum with the bloom band shaded. Shared bits are in
  `thamburaControls.tsx`. Every view must show every state even if it can only
  set part of it (the Raagini's Select only steps Pa/Ma/Ni/Sa).
- `thamburaIsland.tsx` is the thambura docked in a slot (it's handed the
  presenter; `newThamburaPresenter` is what `buildContext` makes it with).
  The page's floating `#play-all` is Start all (`wireFloatingPlay` in
  `session.ts`), and the T key plays the thambura alone on every page of
  ours (`pageShortcut`: not while typing in a field, not with Ctrl/Cmd/Alt,
  not on key repeat). A thambura playing holds the wake lock through
  `buildContext`'s `make`, whether or not an island shows it. The link goes to the address bar
  through the page's `PageLink`: `replaceState`, no history entries, 400 ms
  after the last change, since Safari throws after 100 calls in 30 s and a
  slider drag changes the setup on every step. The
  panel's header has a Copy link button, and its Sound menu plays a preset as
  soon as it is picked; the Lab saves them (Save writes over the one playing,
  Save as… keeps both) and lists them to rename, delete, copy, or Share, which
  opens the `.github/ISSUE_TEMPLATE/share-a-preset.yml` form filled in, so
  listeners can offer sounds to become built-in presets.
- `sw.ts` is the service worker (its own esbuild bundle, classic script, no
  source map, `__BUILD__` set to the git revision so each deploy gets a fresh
  cache, `__SHELL__` the precache list from the app build). Pages are network-first, everything else cache-first with a
  background refresh. It makes the app installable (browsers want a manifest
  plus a worker handling `fetch`) and it runs the whole app offline. It needs
  WebWorker types, not DOM, so `tsconfig.json` excludes it and
  `tsconfig.sw.json` checks it; `pnpm typecheck` runs both.
- `install.ts` keeps the `beforeinstallprompt` event and shows the header's
  `#install-app` button, since browsers only hint at installing. iOS never
  fires it, so `#install-hint` (in the home page's line and on `/about`) points at Share -> Add to
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
  is the continuous voice. It plays to the page's shruthi (`Shruthi`), as
  the mridangam does and the tabla dayan should. Sound quality is issue #8: the jawari voice, fitted
  to a real recording, is the default, and the Lab, links and presets are
  how it gets tuned by ear from here, by us and by listeners.
- **Struck instruments are kits, and the code knows nothing about any one of
  them.** `engine/kit.ts` reads a `kit.json`: zones (the groups of strokes
  that choke each other, a mridangam's two heads or a ghatam's one surface),
  packs (tunings, or one unpitched pack played as recorded), and strokes with
  takes per pack. `player/kitPresenter.ts` is a kit as a track: it loads
  one, follows the page's shruthi, plays on its own audio track (`kit-1`,
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
  `thambura.kit-1`, taken once from `thambura.player`, where the tala kept it.
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
The embed guide (`docs/content/guides/embed/`) is a live host: its examples
load `embed.js` from `embedBase` (thambura.com), or `DOCS_EMBED_BASE` for one
run, and `docs/components/embedExamples.ts` mounts the `mount()` ones. So
publish it only once production has the `embed.js` it describes.

Working on the docs:

- **Publish from master, after production.** `make ghpages` publishes
  whatever tree it runs in, so run it in a worktree detached at
  `origin/master` after the PR merges. Hold it while a page describes app
  behaviour thambura.com doesn't serve yet (the embed guide, a new layout).
  What's live is the `gh-pages` commit's message, `Docs from <git
  describe>`, which the GitHub API shows.
- **Run what a page shows rather than typing it.** Code samples and example
  links went through a throwaway vitest file (see the share-link probe
  below), and the home page's spec example through a throwaway Go test that
  prints `homeSpec`. Delete both afterwards.
- **To try the embed examples before a deploy**, serve a worktree's app on
  one port and `DOCS_EMBED_BASE=http://localhost:<port>/static/ make
  docsrun` on another: two loopback ports are two origins, as a real host
  is.
- **`docsrun`'s watcher missed an edit** to an HTML page once, and kept
  serving the old one. If a change doesn't show, `curl` the page for it and
  restart docsrun.
- **The repo is public** (since 2026-09-26) because GitHub Pages from a
  private repo needs a paid plan. The history was scanned for keys and
  tokens first.

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

Saved settings live in localStorage, which is per origin, so the dev
version doesn't see anyone's thambura.com setup. To try a migration there,
seed the old keys from the DevTools console (for instance `thambura.drone`
and `thambura.player` as the pre-#100 app wrote them), reload without
`?s=`, and check the setup comes back and the new per-instrument keys
appear after the first change. A link from thambura.com is the other way
in: it opens on dev the same as on the live site.

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

Last production deploy: 3c4e21a on 2026-09-27 (the track list on `/`,
#142). Master has moved on since (#148's top panel and `/about`, #149's
instrument rows); dev serves the #149 build.

A `make deploydev` lands as the `dev` version with no traffic, which is easy
to mistake for a production deploy. `gcloud app versions list --project
thambura --service default --format="table(version.id,traffic_split)"`
shows which version thambura.com serves.

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
  After `git rm -r <dir>`, leave `<dir>` out of the `git add`: the pathspec
  no longer matches and `git add` fails, and a commit chained with `;` rather
  than `&&` then commits only the removals (it happened on #122; the PR was
  amended before review).
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

- **Screenshots only when something on screen changes.** A change meant to
  look identical (a refactor, state moving between owners) gets a table from
  a browser check run on master and the branch instead.
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

## Tracking work

The work is grouped into tracks, each an epic with GitHub sub-issues:
#94 instruments (every audible thing a track on one clock), #95 the docs
site, #86 layouts (page spec, labs routes, embedding). Labels: `track:
instruments` / `track: docs` / `track: layouts`, `epic`, `data` (recordings
and kits in thambura-data), and `ready` / `blocked` for whether an issue can
start. Dependencies are GitHub's own "blocked by" links, which only take
issues: a PR can't be a blocker, so name the PR in the body instead. Nothing
flips `blocked` to `ready` when a blocker closes; do it by hand, and tick
the epic's checklist, when a PR merges. `label:"track: instruments"
label:ready` is what can be picked up now.

## Checking in a browser

Playwright's Chromium is at `~/.cache/ms-playwright/chromium-<n>/` (1243 as
of 2026-09-26; `ls` it, the number moves with Playwright updates), and
`playwright-core` can be required from another project's node_modules (e.g.
`../Agni/main/web` or `/workspace/repos/projects/sdlold/web/frontend`). Launch with `--autoplay-policy=no-user-gesture-required`.
The speed and shruthi strip is `[aria-label="Speed and shruthi"]`: the tempo
box `input[aria-label="Tempo in beats per minute"]`, the note
`button[aria-controls="shruthi-keys"]` (its text reads `C 3 · 1`; clicking it
opens `#shruthi-keys`, whose stretched keys have a `title`), the arrows
`button[aria-label="Shruthi up a semitone"]` and "Fine tune up a cent", and
`button:has-text("Start all")`. Space presses a focused button, so click the
page body before testing it as Start all.
On `/` the rows are `[aria-label="Instruments"] article`, each
labelled by its instrument ("Claps", "Thambura", "Mridangam"), with
`button[aria-label="Show more of Mridangam"]` (then "Show less of…"), which
opens `button[aria-label="Remove mridangam"]`, mute and solo as
`button[aria-label^="Mute Claps"]` and `button[aria-label^="Solo Thambura"]`
(their labels go on to say what they do), `input[aria-label="Thambura round length"]`,
`select[aria-label="Add an instrument"]` (options by label), and Undo in the
list's `[role="status"]`. A new browser starts with the claps and the
thambura only; add the mridangam with `selectOption({ label: "Mridangam" })`.
The tala's transport buttons are icons, so select them by label:
`button[aria-label="Start"]` (or "Stop", "Restart", "Previous beat"). With
`getByRole`, pass `exact: true`: name matching is a substring match, so
"Start" also finds Restart. The
thambura's full panel opens with `button[aria-label="Show more of Thambura"]`;
its views are
`button[role="radio"]:has-text("Raagini")` and so on, its mode is
`select[aria-label="Sound"]` (on the row; the panel under it leaves its
own out),
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
It plays alone with `page.keyboard.press("t")` or its row's
`button[aria-label="Start thambura"]`; the floating `#play-all` starts the
tala too. The theme toggle cycles system, light,
dark, so dark takes two clicks (or launch the page with `colorScheme: "dark"`).

Checking an embed (#92) needs a second origin that really is one. Serve the
host page from a plain static server on another loopback port (`python3 -m
http.server 8033 --bind 127.0.0.1`) and have it load `embed.js` from
`http://localhost:<port>`. A page Playwright fulfils with `page.route`, or
any public-looking host name, is blocked by Chrome's Private Network Access
rules from loading `localhost` at all, which reads as a CORS error but tests
nothing. The stand-in host has no `/favicon.ico`, so two 404s in its console
are expected. Playwright locators reach into open shadow roots, so the embed's
buttons are found with the usual selectors; `page.evaluate` needs
`el.shadowRoot.querySelector` instead. A host spec with a `tracks` island
(and the tala's `instrumentControls: false`) is how #149 checked that the
home page's layout is buildable from the public API; name the kits in the
spec's instruments, since `embed.js` only adds the thambura and the claps.

Two things that misread in a screenshot or a style check:

- The page scrolls inside `<main class="overflow-auto">`, not the body, so
  `page.screenshot({ fullPage: true })` captures only the viewport. Scroll
  the part you want into view (`locator.scrollIntoViewIfNeeded()`) first.
- Rows fade with a CSS transition when another is soloed, so reading
  `getComputedStyle(el).opacity` right after the click gives the starting
  value. Wait out the transition (about 300 ms) before reading.

A few probes that worked, all set up in an init script:

- Wrap `AudioParam.prototype.linearRampToValueAtTime` / `setTargetAtTime` to
  count choke fades and the Stop release, and `createStereoPanner` to read
  pans. Every mixer track makes a panner too (#96) but never sets it unless
  asked, so the pan writes are still only the strings'.
- To tell which instrument a sample start was, tag buffers by URL: wrap
  `fetch` so the response's `arrayBuffer()` remembers its URL,
  `decodeAudioData` so the decoded buffer inherits it, and
  `AudioBufferSourceNode.prototype.start` to log `bufUrl.get(this.buffer)`
  with each `when`. Kit samples are under `/Kits/`, claps under `/Sounds/`.
  That's how #97 and #98 compared stroke and clap times on master and the
  branch.
- To make a share link to open, write it with the engine rather than by
  hand: a throwaway vitest file that calls `encodeLink` / `encodePage` and
  ends in `expect(link).toBe("")` prints the link in the failure diff.
  Delete the file afterwards.
- To check that saved choices survive a change (a storage key moving, as in
  #97 and #98), serve the base and then the branch **on the same port**, one
  after the other, and drive both through `launchPersistentContext` with one
  profile directory: localStorage is per origin, so the branch reads what the
  base saved. Set every setting a run depends on explicitly, since the
  profile carries the last run's tala into the next page load; a run that
  relied on the default once reported a difference that was only that.
- A `PerformanceObserver` for `longtask` shows any main-thread stall over
  50 ms, which is how the render slicing was checked with the tala playing.
- Headless Chromium can't test a real wake lock or audio session, so define
  stand-in `navigator.wakeLock` and `navigator.audioSession` objects and log
  the calls.
- `playwright-core` has to be loaded with `createRequire(...)("playwright-core")`.
  Importing its `index.js` from an ESM script gives an object whose `chromium`
  is undefined, and the failure reads as "Cannot read properties of undefined".
- Cold Start is measured by wrapping `AudioBufferSourceNode.prototype.start` in
  an init script, pressing T (before #136, clicking the floating play
  button) and waiting for the first booked pluck: 375 ms on master before #62, 225 ms after. Serve the branch and the
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
