# Handoff: Thambura

Written 2026-09-27, after the instruments track's instance-id work (#127,
#129) and a dev deploy that was clicked through and approved. It folds
forward what is still open from the 2026-09-26 handoff and drops what
closed. The durable notes are in CLAUDE.md, NEXTSTEPS.md and
`docs/designs/`; this file is only what's in flight. Delete it once the
items below close.

## Where things stand

- **The N-instruments path (epic #94).** Every audible thing is a track on
  one clock, with an id: the claps `hands-1` (#98), the thambura
  `thambura-1` (#100), each kit `kit-1` (#97), each on its own mixer track
  with level, pan, mute and solo (#96). The tala only keeps time and shows
  the images. Each instrument keeps its state under its id
  (`thambura.<id>`), and the share link is a page link with one part per
  instrument (format 2), still written as the old format 1 while
  `thambura-1` is the only part, so every link in circulation opens the
  same. `docs/designs/instruments.md` has the plan, the "Several talas at
  once, later" note, and what's done in its table.
- **Deployed to dev, not to thambura.com.** dev-dot-thambura.uc.r.appspot.com
  serves 7e04be3 (master on 2026-09-27), tested by the user that day,
  including the migration from old saved settings, a two-thambura page link,
  labs and `/embed/demo`. thambura.com still serves a78db12; `make deploy`
  is the next step there, and it uploads the mridangam kit with it.
- **Other tracks:** layouts (#86) is through `/embed/demo` (#92), and all
  six of its steps are ticked; #131 (publish to unpkg) and #132 (asset
  packs, also labelled instruments) are new from that side, as sub-issues
  of #86. #130 (the drawer forgetting it was open, from #127/#129) is fixed
  in #133. Docs (#95): the site and several guides are in; #111 waits on
  the library lift (#53).
- **The lift into goapplib and tsappkit is unblocked** now that #92 is in,
  and was planned as one release per library, Go first. goapplib#28:
  `internal/page`, `web/templates/page/Islands.html` and the labs/noindex
  helpers, tagged `v0.2.0` (thambura is on `v0.1.1`), then a thambura PR
  bumps `go.mod`, runs `make templates` and deletes `internal/page`.
  goapplib#27: `web/src/page` (`mountIslands`, `readSpec`, `hostSpec`,
  `shadowSlot`, `IslandPage`) into tsappkit `0.1.0`, with the one breaking
  change agreed: an entry point that takes a registry in place of
  `loadAfterPageLoaded(name, Class, className)`. Two snags before starting:
  the goapplib checkout under `newstack/` has a `.git` pointing at a Mac path
  (`/Users/dzshrh/...`), so use a fresh clone, and npm publish credentials
  in this container haven't been checked. `make liftcheck` keeps both
  folders free of thambura imports until then. goapplib#29 (an esbuild
  preset: splitting, the single-Solid alias and the preload manifest as a
  pair) is a maybe, for when a second esbuild app wants it.
- **The mridangam is still deliberately paused** (#77 to #82); its patterns
  live in the kit track.
- **Kits are not committed.** `make devkit` copies one from the
  `thambura-data` checkout (`../mridangam-data` here) into a gitignored
  folder; Go seeds a `kit` instrument only when one is there.

## Next on the N-instruments path, in order

1. **#101, the track list**, once the user decides how a track looks (see
   below). Everything under it exists: a track per instrument, ids, per-id
   storage, page links. It also takes the tonic wiring off the thambura
   island (a thambura with no island doesn't retune the kit yet), and
   probably a common interface over `KitPresenter`, `HandsPresenter` and
   `ThamburaPresenter` (`ctx.tracks` is their union today).
2. **#39 then #40, render speed** (Web Workers, then an IndexedDB cache of
   rendered plucks). They make every thambura faster to start and to
   retune, and a second thambura (#103) waits on them.
3. **#103, a second thambura**, after those. Two things to fix with it:
   `PageLink.showsBar` marks every thambura part with the one drawer's bar
   flag, and only the drawer's thambura should get it; and the second
   thambura should start fresh, as `newThamburaPresenter` already does (only
   `thambura-1` inherits the pre-id record).
4. **#102, drawn pads** from a `layout` in `kit.json`. Independent, but its
   placement is easier once #101 decides where a track's panel sits.
5. **#99 with #104:** patterns naming their instrument, done alongside the
   first ghatam or kanjira kit, which needs recordings first.
6. **#132, asset packs**, filed by the layouts side: whether hosts and
   listeners can bring their own claps and images. It touches the hands
   track's sound groups.

## Waiting on the user

0. **How a track looks, for #101.** With several instruments on the page:
   what a track shows collapsed (suggested: name, level, mute, solo,
   start), what it shows expanded (that instrument's own panel), and where
   the arrangement is remembered. The suggestion was to try it on a labs
   page (#90) before `/`. Parked on 2026-09-26 to think over; still open.
0. **When to start the lift** (above), and whether #131's npm package and
   tsappkit's publish can use the same credentials.
0. **Whether to `make deploy`** what dev serves. It was tested and approved
   on dev on 2026-09-27, and it puts the mridangam kit on the live site.
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

- **Instruments (#94):** #99, #101, #102, #103, #104 and #132, in the order
  above.
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
  when its PR merged. Only `thambura/checkpoint-n` (this checkpoint's PR) is
  left; remove it once that lands. No servers are left running.
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
