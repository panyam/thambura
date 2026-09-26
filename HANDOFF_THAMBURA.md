# Handoff: Thambura

Written 2026-09-21, after the mridangam work (PRs #66, #68, #73, #74, #75,
#76) and the checkpoint that parks it (#83, #84). It folds forward what was
still open from the previous handoff and drops what closed. The durable notes
are in CLAUDE.md, NEXTSTEPS.md and `docs/designs/`; this file is only what's in
flight. Delete it once the items below close.

## Where things stand

- **The mridangam plays.** Strokes tuned to the thambura with a pad, patterns
  written in the notations DSL and compiled at build time, written patterns
  for Adi, Short Rupakam and the Misra and Khanda chaapus, a generated
  skeleton for every other tala and nadai, a stroke lane that lights with the
  sound, variations, and a korvai that lands on sam. Heard in Chrome on
  2026-09-21 and called "great". `docs/designs/mridangam.md` is the plan; the rest is
  filed as #77 to #82 and **the mridangam is deliberately paused**.
- **Attention moves to several instruments at once**, `docs/designs/instruments.md`.
  The open question is at the top of that doc and should be settled before
  the mixer is built: with several instruments, what a track shows when it is
  collapsed, which of an instrument's views it is set to, and how the page
  remembers that. The plan's order (tracks and mixer, then the hands as a
  track, then instance ids) assumed today's panels, which is the part most
  likely to change.
- **Kits are not committed.** `make devkit` copies one from the
  `thambura-data` checkout into a gitignored folder; Go looks for
  `*/kit.json` at startup and only then tells the page about it, so a plain
  clone has no pad and no 404. A fresh box needs `thambura-data` cloned
  beside the app (`git clone git@github.com:panyam/thambura-data.git`) before
  `make devkit` works.
- **panyam/thambura-data** (private, new this session) holds the sample work:
  `kit/` the lossless master, `kit-flac/` what the app loads, `kit-aac/` a
  third the size for when #72 settles, `tools/` the measuring and building
  scripts, `pad.html` for listening, and a README with the measurements.
- **thambura.com is behind master.** It served 14b1c48 before this session,
  and master is now well past it. `/sw.js` carries the build revision, which
  is the quickest way to ask. `make deploy` runs from this container, which
  has `gcloud` signed in as the project's owner, and `make deploydev` puts it
  on `dev-dot-layagnana.appspot.com` first. Note that deploying with a kit
  installed uploads it, which distributes the dataset publicly.

## Waiting on the user

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

- This session worked from `thambura/main` in worktrees. Two are left, both
  with open PRs: `thambura/mridangam-handoff` (#83) and
  `thambura/checkpoint-instruments` (#84). Remove them once those land.
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
