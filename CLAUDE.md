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
make deploy      # tests + prod build, then App Engine project thambura (see Deploying)
make prodlogs    # tail App Engine logs
```

Built assets (`app.js`, `tailwind.css`) are gitignored. `.gcloudignore` exists
so a deploy still uploads them.

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
  `goal.BasePage` plus a `Header` struct for goapplib's header.
- `web/templates/BasePage.html` extends goapplib's BasePage: our logo, no login
  actions, no HTMX, no header drawer. Pages must define both `BodySection` and
  `PageScripts`; Go templates reject a second definition, so the base can't give
  them defaults.
- Search and link previews: pages render a `SitePage` (goapplib's
  `BasePage` plus our `Header`, `Social` and `StructuredData`), and
  `BasePage.html` turns it into the canonical link, Open Graph and Twitter
  tags, icons, manifest and JSON-LD. Absolute URLs come from `brand.URL`
  (`https://thambura.com`), so the www and appspot copies point at it. Go
  serves `/robots.txt`, `/sitemap.xml` and `/favicon.ico`. `HomePage.html`
  has a visible About section under the player, the page's only `<h1>` and
  the only text a crawler that doesn't run JavaScript sees. The PNGs
  (`web/static/og.png`, `web/static/icons/`, `favicon.ico`) come from
  `node design/render-images.mjs` (preview layout in `design/og.html`),
  which needs `PLAYWRIGHT_CORE` and `CHROMIUM` pointed at an install.
- `/legacy/` serves the 2016 app from `web/legacy/`, copied from the
  `pre-sadhana-port` tag with its `/static/` paths moved under
  `/legacy/static/` (see `web/legacy/README.md`). The header's "Legacy" link
  goes there. `app.yaml` needs a separate `static_files` line for
  `/legacy/`, since `static_dir` serves no index page. Both it and the Go
  server send `X-Robots-Tag: noindex` for `/legacy`.

## Frontend (web/src)

`docs/architecture.md` explains how the sounds are made and timed, timed vs
continuous voices, and what changed from the 2016 app.
`docs/sound-analysis.md` explains how the jawari voice was fitted to a
recording, and how to rerun it: `pnpm render-mix` (web/scripts, over
`src/tools/thamburaMix.ts`) renders the thambura offline to WAV, and the
Python in `tools/sound-analysis/` measures and charts it against a recording
kept in the gitignored `recordings/`. The notes below are the file-by-file
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
- `assets.ts` parses sound/image groups from `TalasFixtures.json`. Groups named
  in `RandomGroups` pick an entry per step from the step's `variant` draw
  (the SaRiGaMa "randomness mode"). The player opens on the first sound and
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
  and guitar renders are pinned by fingerprints in `thambura.test.ts`. A 9 s tambura render takes about
  100 ms at 48 kHz, so `PluckRender` renders a few harmonics per `step(budget)`
  and gives the same samples however the work is sliced. Never render inside a
  transport tick. `reedSpectrum` gives the sruti drone's PeriodicWave.
- `thamburaPlan.ts`: a `ThamburaPlan` is everything that decides how the
  plucked thambura plays: per string a `PluckVoice`, level, pan, detune and
  damp lead, plus the four gaps. `planFor` builds one for any mode (the
  string levels, pans and the 1.5-cent Sa detune live here); Custom mode
  plays the plan the Lab view edits. `FIELD_SPECS` lists the Lab's controls
  and their ranges, which cover every built-in mode's values, and
  `normalizePlan` clamps a saved or pasted plan to them.
- `shareLink.ts`: the thambura's whole setup (settings but volume, view,
  whether the bar is open, and for Custom mode the plan) packed into the
  `?s=` query parameter as base64url bytes. A Custom plan is stored as edits
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
  shared by every island; buses `tala`, `drone`, `percussion` (each with its
  own volume) feed a master gain, then a limiter, then the speakers. It holds a
  sample cache, which `addSamples` fills with rendered PCM as well as fetched
  files. `play` takes detune/gain/pan and a choke group (a later note in the
  group fades the earlier one over 80 ms, as a re-plucked string does);
  `startTone` runs a continuous PeriodicWave tone. `cancel(bus)` stops only
  samples that haven't started, and takes back the choke fades they scheduled.
  `release(bus, s)` fades out what's sounding, and `damp(group, when, s)`
  fades the latest note in a choke group, as a finger stops a string.
  `heardNow` is the audio time minus output latency.
- `transport.ts`: every 25 ms, driven by a Web Worker timer so background tabs
  aren't throttled, it pulls events up to 100 ms ahead from each sequencer. All
  tracks share one start time and, when given one, a `TempoMap`. The 25/100 ms numbers are
  the defaults from "A Tale of Two Clocks" (web.dev), not tuned. They tolerate
  about 75 ms (look-ahead minus interval) of main-thread stall before a note
  plays late. A late note is clamped to `currentTime`, and later notes stay on
  the grid. Tempo isn't limited by the window: at 300 bpm with sankeernam ticks
  about 22 ms apart, every tick still gets its exact audio time.
- `presenter.ts` (`PlayerPresenter`): owns the engine and the transport, turns
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
  `island.tsx` wires the real browser dependencies in, and `main.ts` mounts it
  from a tsappkit `BasePage`, which also wires the theme toggle.
- `thamburaPresenter.ts` (`ThamburaPresenter`): the thambura's state, its own
  `Transport` (so it starts and stops apart from the tala), the plucked
  (tambura, guitar) and reed (sruti) voices on the `drone` bus, and the
  floating bar's open/view state and the Custom plan, saved to localStorage.
  Everything plucked goes through the settings' plan (`planFor`): its voices
  key and render the samples, and `pluckOptions` turns a pluck into
  level, pan and detune. `setCustom` / `loadCustom` edit the Custom plan and
  switch to it; loading a mode sounds the same and renders nothing. A link
  in `deps.link` wins over the saved setup (keeping the listener's volume)
  but isn't saved over it until the listener changes something; every change
  writes the current link back. Pitch and timbre
  changes re-render the plucks in about 20 ms slices through `deps.defer`
  (60 ms settle after a change, none between slices), and Start waits for them,
  about 0.35 s from cold. Fine tune is only `detune`. In both tambura modes the
  second Sa string plays 1.5 cents sharp, so the pair beats slowly. Damp
  events fade a string over 0.2 s through `audio.damp`, which marks the note
  released so the re-pluck's choke leaves it alone. Sruti mode
  mixes its three tones swara-first (0.40 / 0.25 / 0.08, panned apart), since
  the octave Sa's otherwise fuse into one note and bury the swara.
- `ThamburaBar.tsx` is the bar that slides up from the bottom when the header's
  `#thambura-toggle` is clicked. Its header holds the Sound menu (the mode,
  from `THAMBURA_MODES`, so it applies in every view) and a switch between
  four views over the same presenter: `ThamburaMini`, `ThamburaStudio`,
  `ThamburaRaagini` (the 2000s Raagini box, with `Knob.tsx`, which keeps its
  own TMB/GTR/SHRUTHI slide switch as part of the replica) and `ThamburaLab`,
  a workbench for the Custom plan, string by string, that copies it out and
  in as JSON (`pnpm render-mix --custom` renders it). Its sliders commit on
  release, since most changes re-render. Shared bits are in
  `thamburaControls.tsx`. Every view must show every state even if it can only
  set part of it (the Raagini's Select only steps Pa/Ma/Ni/Sa).
- `thamburaIsland.tsx` wires the link to the address bar: `replaceState`, no
  history entries, 400 ms after the last change, since Safari throws after
  100 calls in 30 s and a slider drag changes the setup on every step. The
  bar's header has a Copy link button.
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
  tonic (`tunedTonicHz`). Sound-quality work is tracked in issue #8: the
  jawari voice is the fit to a real recording, and by-ear checks decide
  whether it becomes the default.
- **Mridangam / tabla:** the musical timeline is in (`ratio.ts`,
  `tempoMap.ts`). Add a `Sequencer<StrokeEvent>` on the tala's `TempoMap` and
  `Transport` that emits per stroke at exact positions, reads the tala's
  position for eduppu and korvai alignment (nothing exposes the cycle and beat
  for a count yet), and plays on the `percussion` bus.
- Drum playback needs choke groups (a damped stroke cuts a ringing one on the
  same head), so give each sounding note its own gain node and fade it out over
  5-10 ms rather than calling `stop()`, which clicks. Also plan for 2-3 takes per
  stroke, picked by the step's `variant`, and trimmed mono samples, since decoded
  PCM is about 350 KB/s stereo.

## Deploying

`make deploy` runs the tests, a minified frontend build and a Go build, then
`gcloud app deploy` to the `thambura` project (`GCP_PROJECT=... make deploy`
to override). It refuses to run with active `replace` directives in go.mod.
The runtime is `go126` in `app.yaml`, which has to be at least the `go` line
in go.mod. App Engine serves `/static` itself (`static_dir: web/static`) and
forces HTTPS.

One-time setup, run by an owner of the project from a machine with `gcloud`
(the dev container has none):

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
  `cd <dir>/web && pnpm install`.
- Stage explicit paths, and check `git status` for files you didn't touch.
- Serve a worktree on its own port: `(cd web && pnpm buildcss && pnpm build)`,
  then `PORT=8001 go run .` from the worktree root. Whatever runs on :8000 is
  serving the shared checkout's branch, which may be stale.
- Put `pr-assets` screenshots through a worktree of `origin/pr-assets` too.
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
`../Agni/main/web`). Launch with `--autoplay-policy=no-user-gesture-required`.
The tala's transport buttons are icons, so select them by label:
`button[aria-label="Start"]` (or "Stop", "Restart", "Previous beat"). With
`getByRole`, pass `exact: true`: name matching is a substring match, so
"Start" also finds Restart. The
thambura opens with `#thambura-toggle`, its views are
`button[role="radio"]:has-text("Raagini")` and so on, its mode is
`select[aria-label="Sound"]`, `button[aria-label="Copy link"]` copies the
page's `?s=` link (give the context the clipboard permissions to read it back;
a fresh context opening that URL is the second listener), the Lab's controls are ranges labelled by field
(`input[aria-label="Attack"]`, tabs under `[aria-label="String"]`) with the
plan in `textarea[aria-label="Settings JSON"]`, and it plays with
`button[aria-label="Start thambura"]`. The theme toggle cycles system, light,
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
- `pkill -f <pattern>` can match the shell running it and kill it; kill a
  server by port (`fuser -k 8001/tcp`) instead.
