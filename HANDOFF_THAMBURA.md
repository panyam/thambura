# Handoff: Thambura

Written 2026-09-26, after the instruments track's first four PRs (#114,
#118, #122, #124), on top of the 2026-09-21 handoff (the mridangam parked).
It folds forward what is still open and drops what closed. The durable notes
are in CLAUDE.md, NEXTSTEPS.md and `docs/designs/`; this file is only what's
in flight. Delete it once the items below close.

## Where things stand

- **Every audible thing is a track on one clock** (epic #94,
  `docs/designs/instruments.md`). The mixer has a track per instrument with
  level, pan, mute and solo (#96). The mridangam is a kit track (`kit-1`)
  that plays along by itself and resumes on sam after a stop (#97; the old
  code put the drum's sam wherever the tala resumed). The claps are a hands
  track (`hands-1`) playing the tala's calls on `clock.ticks` (#98), so the
  tala keeps time and shows the images and makes no sound. SaRiGaMa and its
  per-step random draw are gone (#122). Talas stay their own group; several
  at once is later.
- **Next in that track:** #100 (instance ids through the thambura's
  settings, presets and links; a share-link `FORMAT` bump, old links must
  still open), then #101 (the track list), which waits on a decision below.
  #99, #102 and #104 are ready and independent; #103 waits on #100 and on
  render speed (#39, #40).
- **Other tracks, run by other sessions:** layouts (#86): the page spec and
  labs routes are in, `/embed/demo` (#92) is left and now unblocked. Docs
  (#95): the site skeleton is in (#105); the guides #106, #107, #109 and #110
  are unblocked, #111 waits on the library lift (#53).
- **The mridangam is still deliberately paused** (#77 to #82). Its patterns
  now live in the kit track (`KitPresenter`), not the tala.
- **Kits are not committed.** `make devkit` copies one from the
  `thambura-data` checkout into a gitignored folder; Go looks for
  `*/kit.json` at startup and only then seeds a kit instrument, so a plain
  clone has no pad and no 404. A fresh box needs `thambura-data` cloned
  beside the app (`git clone git@github.com:panyam/thambura-data.git`) before
  `make devkit` works.
- **panyam/thambura-data** (private) holds the sample work: `kit/` the
  lossless master, `kit-flac/` what the app loads, `kit-aac/` a third the
  size for when #72 settles, `tools/` the measuring and building scripts,
  `pad.html` for listening, and a README with the measurements.
- **thambura.com is behind master.** It serves a78db12 (checked 2026-09-26),
  before the layouts, docs and instruments work. `/sw.js` carries the build
  revision, which is the quickest way to ask. `make deploydev` puts a build
  on `dev-dot-thambura.uc.r.appspot.com` first, and `make deploy` runs from
  this container. Deploying with a kit installed uploads it, which
  distributes the dataset publicly.

## Waiting on the user

0. **How a track looks, for #101.** With several instruments on the page:
   what a track shows collapsed (suggested: name, level, mute, solo,
   start), what it shows expanded (that instrument's own panel), and where
   the arrangement is remembered. The suggestion was to try it on a labs
   page (#90) before `/`. Parked on 2026-09-26 to think over.
1. **The wording and date of Evan Laforge's permission** for karya's
   patterns. `web/patterns/CREDITS.md` has a placeholder asking for it.
2. **Phone checks** on the live site, which headless Chromium can't do:
   iPhone Safari with the silent switch on, the address bar updating as
   settings change, Copy link and Share, and whether the screen stays awake
   through a long drone.
3. **A listen to the tala** clicks against the images, and to the mridangam
   at the odds the Variety control uses. Those numbers are mine: "some"
   varies about a third of cycles, "lots" about seven in ten.
4. **Three sound questions** from the analysis, best settled by ear in the
   Lab: whether the second Sa should pluck louder (it lifts the mix +1.2 dB
   against the recording's +2.8), whether a softer attack (20-30 ms against
   7 ms) sounds closer to a finger, and whether a shorter ring does (the
   recording's harmonics fall about twice as fast as ours). A preset link or
   the Lab's Settings JSON hands a result back.
5. **A recording of iTablaPro's tanpura**, or any real tanpura (#47), which
   would replace the guesswork behind the Shimmer and Warm presets with a fit.
6. **Two small decisions** still unmade: whether www.thambura.com should
   redirect to the bare domain, and whether to keep the dev container's IP
   (98.248.54.110) on the Namecheap API whitelist.
7. **Who vets the mridangam patterns.** Everything that plays is either from
   karya (attributed to Evan's teachers, converted by us and unverified) or
   generated, except the Adi one, which I drafted from the stroke names.
   Replacing that one is the most valuable change in #79.

## Open issues

- **Instruments (#94):** #99, #100, #101, #102, #103, #104, above.
- **Filed by other sessions since the last handoff:** #113 (pluck patterns
  beyond Pa Sa Sa Sa), #116 (the Lab as a string editor beside any skin),
  #121 (a bug: a built-in sound's hidden values change old Custom links
  without the drift notice).
- **Mridangam, paused:** #77 fills, eduppu and a count-in; #78 a pattern to
  suit the tempo; #79 more patterns and replacing the drafted Adi one; #80
  recording arai chapu and the left-hand tha; #81 the lane on a long cycle;
  #82 solkattu under the strokes.
- **#72, the AAC kit.** Both copies are built and the app loads FLAC. What
  decides it is the attack onset in real Chrome and Safari, which cannot be
  measured here: Playwright's Chromium has no AAC at all, and a lossy
  format's encoder padding can put a stroke late.
- **Thambura sound:** #8 is the umbrella (the three questions above, a 5th
  string, a second tambura); #51 a Hindustani-leaning preset, waiting on
  players; #45 (fit the Lab's parameters automatically), #46, #47; #64
  (curves read at fixed times outrun a 3 s round); #52 pluck models behind
  one interface.
- **Render speed #36:** #37 and #38 are done. #39 (workers) and #40 (an
  IndexedDB cache) are next; #41 (WebAssembly) looks a poor trade; #42 (an
  AudioWorklet) is open.
- **#22, hand images**, another session's, blocked on deciding what the three
  kriyas should look like.
- **Upstream, in panyam/notations**, all filed with reproductions this
  session: #17 `___` never lexes as a silent space, #18 parsing pulls in the
  renderer, #19 bar lines inside a role are a tokenizer error, #20 the ESM
  build can't be imported from Node, #21 no working comment syntax, #22 a
  failed `load()` poisons every later one. #19 and #21 shape how our pattern
  files are written, and #22 is why the compiler stops at the first bad file.

## Environment

- This session worked from `thambura/main` in worktrees and removed each
  when its PR merged, and the two left over from the last handoff. Only
  `thambura/checkpoint-tracks` (this checkpoint's PR) is left; remove it once
  that lands.
- **No servers left running from this session.** Other sessions hold 8001 and
  8002; 8080 and 8091 are something else. Serve a worktree on a free port and
  **check it is free afterwards**: `fuser` is not installed, so `fuser -k`
  silently does nothing, the old server keeps the port and the new binary
  fails to bind while the browser is still served by the old build. That
  presents as a code bug. See CLAUDE.md, "Checking in a browser".
- A box restart loses each worktree's `web/node_modules` and the shared
  `../.venv` (`make setupvenv` rebuilds it), neither of which is committed.
- `thambura/mridangam-data` is the working copy of `thambura-data`, 359 MB
  including the raw stroke dataset, which is fetched rather than committed
  (`make dataset`). A restart keeps it; a fresh box needs the clone.
- The C recording is `thambura/01-Tanpura-Sample.mp3`, outside every
  checkout. To rerun the sound analysis, copy it into a worktree's gitignored
  `recordings/` as `tambura-C.mp3`, then `pnpm render-mix` in `web/` for the
  renders. The feature files in `tools/sound-analysis/features/` are
  committed so the tables and scores can be redone without any of it.
