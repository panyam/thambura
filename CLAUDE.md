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
drone feature inside the app is also called the thambura. The local folder is
still `layaguide`, and the `pre-sadhana-port` tag keeps the port's working
name (it was briefly called Sadhana).

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
- `shruthi.ts` is the thambura's pitch maths and settings: 15 keys from A2 to
  B3 with kattai names (C3 = 1 is a men's Sa, G3 = 5 a women's; gents/ladies
  is timbre, not octave), the 12 swarasthanas with just ratios, and
  `normalizeThambura`, which clamps anything (saved JSON, a patch) to valid
  settings.
- `tambura.ts` renders a pluck as a sum of decaying harmonics with a resonance
  sweeping down through them (a stand-in for the jawari). `pluckVoice` has two
  characters. In tambura mode a string rings 12-36 s (to -60 dB) and keeps its
  high harmonics, so it is still sounding when its next pluck comes. In guitar
  mode it rings 2.5-8 s and dulls quickly. A 9 s tambura render takes about
  100 ms at 48 kHz, so `PluckRender` renders a few harmonics per `step(budget)`
  and gives the same samples however the work is sliced. Never render inside a
  transport tick. `reedSpectrum` gives the sruti drone's PeriodicWave.
- `thamburaSequencer.ts` plucks first, Sa, Sa, low Sa, then rests a slot. It
  works out each pluck's time only when asked, so a speed change is heard at
  the next pluck.

**player/** is the browser side:

- `audio.ts` (`AudioEngine`): one AudioContext, created in `main.ts` and
  shared by every island; buses `tala`, `drone`, `percussion` (each with its
  own volume) feed a master gain, then a limiter, then the speakers. It holds a
  sample cache, which `addSamples` fills with rendered PCM as well as fetched
  files. `play` takes detune/gain/pan and a choke group (a later note in the
  group fades the earlier one over 80 ms, as a re-plucked string does);
  `startTone` runs a continuous PeriodicWave tone. `cancel(bus)` stops only
  samples that haven't started, and takes back the choke fades they scheduled.
  `release(bus, s)` fades out what's sounding.
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
- `thamburaPresenter.ts` (`ThamburaPresenter`): the thambura's state, its own
  `Transport` (so it starts and stops apart from the tala), the plucked
  (tambura, guitar) and reed (sruti) voices on the `drone` bus, and the
  floating bar's open/view state, saved to localStorage. Pitch and timbre
  changes re-render the plucks in about 20 ms slices through `deps.defer`
  (60 ms settle after a change, none between slices), and Start waits for them,
  about 0.35 s from cold. Fine tune is only `detune`. In tambura mode the
  second Sa string plays 1.5 cents sharp, so the pair beats slowly. Sruti mode
  mixes its three tones swara-first (0.40 / 0.25 / 0.08, panned apart), since
  the octave Sa's otherwise fuse into one note and bury the swara.
- `ThamburaBar.tsx` is the bar that slides up from the bottom when the header's
  `#thambura-toggle` is clicked, with a switch between three views over the
  same presenter: `ThamburaMini`, `ThamburaStudio` and `ThamburaRaagini` (the
  2000s Raagini box, with `Knob.tsx`). Shared bits are in
  `thamburaControls.tsx`. Every view must show every state even if it can only
  set part of it (the Raagini's Select only steps Pa/Ma/Ni/Sa).
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

- **Shruthi box:** done as the thambura (see above). Its tambura and guitar
  modes are a sequencer on its own clock and speed, not the tala's tempo; its
  sruti mode is the continuous voice. The mridangam and tabla dayan should tune
  to its tonic (`tunedTonicHz`). Sound-quality work (matching a real tambura
  recording, by-ear checks) is tracked in issue #8.
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

DNS for thambura.com is on Namecheap (BasicDNS, `dns1/dns2.registrar-servers.com`).
The records were set on 2026-09-18 through the Namecheap API
(`NAMECHEAP_API_USER` / `NAMECHEAP_API_KEY`, which only work from IPs
whitelisted under Profile > Tools > API Access). `namecheap.domains.dns.setHosts`
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
  `https://github.com/panyam/thambura/blob/pr-assets/<path>?raw=true`.
- **The old app** runs from a worktree of the `pre-sadhana-port` tag, served
  with `python3 -m http.server`, at `/templates/home.html`.
- **Audio timing** is measured by wrapping `AudioBufferSourceNode.prototype.start`
  in an init script and recording each `when`. That captures the scheduled audio
  time; image-change timing only shows animation-frame jitter.

## Checking in a browser

Playwright's Chromium is at `~/.cache/ms-playwright/chromium-1234/`, and
`playwright-core` can be required from another project's node_modules (e.g.
`../Agni/main/web`). Launch with `--autoplay-policy=no-user-gesture-required`.
The tala's transport buttons are icons, so select them by label:
`button[aria-label="Start"]` (or "Stop", "Restart", "Previous beat"). The
thambura opens with `#thambura-toggle`, its views are
`button[role="radio"]:has-text("Raagini")` and so on, and it plays with
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
